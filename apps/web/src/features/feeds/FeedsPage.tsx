import { useEffect, useState } from "react";
import { Alert, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import type { Feed, FeedInput } from "@paper-radar/shared";
import { getFeedModelStatuses, listFeeds, saveFeed, setFeedActive } from "../../lib/api";
import type { FeedModelStatus } from "./modelStatus";
import { PageContainer } from "../../components/layout/PageContainer";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { EmptyState } from "../../components/ui/EmptyState";
import { starterFeeds, uncreatedStarterFeeds } from "./starterFeeds";

const empty: FeedInput = { name: "", description: "", include_keywords: "", exclude_keywords: "", priority_keywords: "", min_publication_year: 2018 };

export function FeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [form, setForm] = useState<FeedInput>(empty);
  const [editing, setEditing] = useState<string>();
  const [modelStatuses, setModelStatuses] = useState<Record<string, FeedModelStatus>>({});
  const [message, setMessage] = useState("");
  const [addingStarterFeeds, setAddingStarterFeeds] = useState(false);
  const pendingStarterFeeds = uncreatedStarterFeeds(feeds);

  async function load() {
    try {
      const nextFeeds = await listFeeds();
      setFeeds(nextFeeds);
      setModelStatuses(await getFeedModelStatuses(nextFeeds.map((feed) => feed.id)));
    } catch (error) { setMessage((error as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  async function addStarterFeeds() {
    const pending = uncreatedStarterFeeds(feeds);
    if (!pending.length) return;
    setAddingStarterFeeds(true);
    try {
      const created = [];
      for (const template of pending) created.push(await saveFeed(template));
      const nextFeeds = [...feeds, ...created].sort((a, b) => a.name.localeCompare(b.name));
      setFeeds(nextFeeds);
      setModelStatuses(await getFeedModelStatuses(nextFeeds.map((feed) => feed.id)));
      setMessage(`${created.length} starter feeds added`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setAddingStarterFeeds(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const feed = await saveFeed(form, editing);
      const nextFeeds = editing ? feeds.map((item) => item.id === feed.id ? feed : item) : [...feeds, feed].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      setFeeds(nextFeeds);
      setModelStatuses(await getFeedModelStatuses(nextFeeds.map((item) => item.id)));
      setForm(empty);
      setEditing(undefined);
      setMessage("Saved");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  function edit(feed: Feed) {
    setEditing(feed.id);
    setForm({
      name: feed.name,
      description: feed.description,
      include_keywords: feed.include_keywords.join(", "),
      exclude_keywords: feed.exclude_keywords.join(", "),
      priority_keywords: feed.priority_keywords.join(", "),
      min_semantic_similarity: feed.min_semantic_similarity,
      min_publication_year: feed.min_publication_year,
    });
  }

  return <PageContainer>
    <PageHeader title="Feeds" description="Shape the sources and topics that power your personal research radar." action={pendingStarterFeeds.length ? <Button variant="outlined" onClick={() => void addStarterFeeds()} disabled={addingStarterFeeds}>{addingStarterFeeds ? "Adding starter feeds…" : `Add ${pendingStarterFeeds.length} starter feed${pendingStarterFeeds.length === 1 ? "" : "s"}`}</Button> : undefined} />
    {message && <Alert severity={message === "Saved" ? "success" : "error"} onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}
    <Paper component="form" onSubmit={submit} sx={{ p: { xs: 2, sm: 3 }, mb: 4 }}><Stack spacing={2}>
      <Typography variant="h2">{editing ? "Edit feed" : "Create a feed"}</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField required label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} fullWidth /><TextField label="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} fullWidth /></Stack>
      <TextField label="Include keywords" helperText="Comma-separated terms" value={form.include_keywords} onChange={(event) => setForm({ ...form, include_keywords: event.target.value })} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField label="Exclude keywords" value={form.exclude_keywords} onChange={(event) => setForm({ ...form, exclude_keywords: event.target.value })} fullWidth /><TextField label="Priority keywords" value={form.priority_keywords} onChange={(event) => setForm({ ...form, priority_keywords: event.target.value })} fullWidth /></Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", sm: "center" } }}><FormControl sx={{ minWidth: 250 }}><InputLabel id="similarity-label">Minimum similarity</InputLabel><Select labelId="similarity-label" label="Minimum similarity" value={String(form.min_semantic_similarity ?? 0.35)} onChange={(event) => setForm({ ...form, min_semantic_similarity: Number(event.target.value) })}>{[0.25, 0.35, 0.45, 0.55, 0.65].map((value) => <MenuItem key={value} value={value}>{value.toFixed(2)}</MenuItem>)}</Select></FormControl><TextField label="Recent papers from" type="number" slotProps={{ htmlInput: { min: 1900, max: new Date().getFullYear() } }} value={form.min_publication_year ?? 2018} onChange={(event) => setForm({ ...form, min_publication_year: Number(event.target.value) })} helperText="Older papers are filtered out" /><Stack direction="row" spacing={1}><Button type="submit" variant="contained">{editing ? "Save feed" : "Create feed"}</Button>{editing && <Button type="button" onClick={() => { setEditing(undefined); setForm(empty); }}>Cancel</Button>}</Stack></Stack>
    </Stack></Paper>
    <Stack spacing={1.5}>{feeds.map((feed) => <Paper key={feed.id} sx={{ p: { xs: 2, sm: 2.5 } }}><Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", gap: 2 }}><Stack spacing={0.75} sx={{ minWidth: 0 }}><Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}><Typography variant="h3">{feed.name}</Typography><StatusBadge label={feed.is_active ? "Active" : "Archived"} tone={feed.is_active ? "success" : "default"} /></Stack><Typography color="text.secondary">{feed.description || "No description"}</Typography><Typography variant="caption" color="text.secondary">Model: {modelStatuses[feed.id]?.status ?? "Cold start"} · {modelStatuses[feed.id]?.total ?? 0} labels · Relevant {modelStatuses[feed.id]?.relevant ?? 0} · Maybe {modelStatuses[feed.id]?.maybe ?? 0} · Not relevant {modelStatuses[feed.id]?.notRelevant ?? 0}</Typography></Stack><Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}><Button component={Link} to={`/?feed=${encodeURIComponent(feed.id)}`} size="small">Open Today</Button><Button size="small" onClick={() => edit(feed)}>Edit</Button><Button size="small" color={feed.is_active ? "inherit" : "primary"} onClick={() => void setFeedActive(feed.id, !feed.is_active).then(() => setFeeds((current) => current.map((item) => item.id === feed.id ? { ...item, is_active: !item.is_active } : item))).catch((error: Error) => setMessage(error.message))}>{feed.is_active ? "Archive" : "Activate"}</Button></Stack></Stack></Paper>)}{!feeds.length && <EmptyState title="No feeds yet" description="Create your first feed to start collecting papers." />}</Stack>
  </PageContainer>;
}
