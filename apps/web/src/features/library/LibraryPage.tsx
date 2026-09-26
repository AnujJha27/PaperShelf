import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import type { Paper, PaperState } from "@paper-radar/shared";
import { addPaperFromUrl, addToZotero, listFeeds, searchLibrary } from "../../lib/api";
import { PaperCard } from "../papers/PaperCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageContainer } from "../../components/layout/PageContainer";
import { PageHeader } from "../../components/layout/PageHeader";

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [items, setItems] = useState<Array<Paper & { state: PaperState }>>([]);
  const [message, setMessage] = useState("");
  const [feeds, setFeeds] = useState<Array<{ id: string; name: string }>>([]);
  const [feedId, setFeedId] = useState<string>();
  const [year, setYear] = useState<string>("");
  const [zoteroOnly, setZoteroOnly] = useState(false);
  const [paperUrl, setPaperUrl] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);
  const [success, setSuccess] = useState("");
  useEffect(() => { void listFeeds().then(setFeeds).catch((error: Error) => setMessage(error.message)); }, []);
  useEffect(() => { void searchLibrary(query, { feedId, year: year ? Number(year) : undefined, zoteroOnly }).then(setItems).catch((error: Error) => setMessage(error.message)); }, [query, feedId, year, zoteroOnly, reload]);
  async function addPaper(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true); setMessage(""); setSuccess("");
    try {
      await addPaperFromUrl(paperUrl, paperTitle);
      setPaperUrl(""); setPaperTitle(""); setReload((current) => current + 1); setSuccess("Paper added to your queue");
    } catch (error) { setMessage((error as Error).message); }
    finally { setAdding(false); }
  }
  return <PageContainer><PageHeader title="Library" description="Search finished papers and the notes you left behind." /><Stack component="form" onSubmit={addPaper} spacing={1.25} sx={{ mb: 3, p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}><Typography variant="h2">Add a paper</Typography><Typography variant="body2" color="text.secondary">Paste an arXiv, ScienceDirect, or other HTTPS paper link.</Typography><Stack direction={{ xs: "column", md: "row" }} spacing={1.5}><TextField required type="url" label="Paper link" placeholder="https://arxiv.org/abs/..." value={paperUrl} onChange={(event) => setPaperUrl(event.target.value)} sx={{ flex: 1 }} /><TextField label="Title (optional)" value={paperTitle} onChange={(event) => setPaperTitle(event.target.value)} sx={{ flex: 1 }} /><Button type="submit" variant="contained" disabled={adding}>{adding ? "Adding…" : "Add to queue"}</Button></Stack></Stack>{success && <Alert severity="success" onClose={() => setSuccess("")} sx={{ mb: 2 }}>{success}</Alert>}{message && <Alert severity="error" onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}<Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 3 }}><TextField label="Search papers and notes" value={query} onChange={(event) => setQuery(event.target.value)} sx={{ flex: 1, minWidth: 240 }} /><FormControl size="small" sx={{ minWidth: 180 }}><InputLabel id="library-feed-label">Feed</InputLabel><Select labelId="library-feed-label" value={feedId ?? ""} label="Feed" onChange={(event) => setFeedId(event.target.value || undefined)}><MenuItem value="">All feeds</MenuItem>{feeds.map((feed) => <MenuItem key={feed.id} value={feed.id}>{feed.name}</MenuItem>)}</Select></FormControl><TextField label="Year" type="number" value={year} onChange={(event) => setYear(event.target.value)} sx={{ width: { xs: "100%", md: 120 } }} /><FormControlLabel control={<Checkbox checked={zoteroOnly} onChange={(event) => setZoteroOnly(event.target.checked)} />} label="In Zotero" /></Stack>{items.map((item) => <PaperCard key={item.id} paper={item} abstractMode="compact" actions={[]} onAction={() => undefined} onAddToZotero={() => void addToZotero(item.id).catch((error: Error) => setMessage(error.message))} />)}{!items.length && <EmptyState title="No matching papers" description="Try a different search or loosen one of the filters." />}</PageContainer>;
}
