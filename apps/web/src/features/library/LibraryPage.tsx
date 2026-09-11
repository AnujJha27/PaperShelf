import { useEffect, useState } from "react";
import { Alert, Checkbox, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import type { Paper, PaperState } from "@paper-radar/shared";
import { addToZotero, listFeeds, searchLibrary } from "../../lib/api";
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
  useEffect(() => { void listFeeds().then(setFeeds).catch((error: Error) => setMessage(error.message)); }, []);
  useEffect(() => { void searchLibrary(query, { feedId, year: year ? Number(year) : undefined, zoteroOnly }).then(setItems).catch((error: Error) => setMessage(error.message)); }, [query, feedId, year, zoteroOnly]);
  return <PageContainer><PageHeader title="Library" description="Search finished papers and the notes you left behind." /><Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 3 }}><TextField label="Search papers and notes" value={query} onChange={(event) => setQuery(event.target.value)} sx={{ flex: 1, minWidth: 240 }} /><FormControl size="small" sx={{ minWidth: 180 }}><InputLabel id="library-feed-label">Feed</InputLabel><Select labelId="library-feed-label" value={feedId ?? ""} label="Feed" onChange={(event) => setFeedId(event.target.value || undefined)}><MenuItem value="">All feeds</MenuItem>{feeds.map((feed) => <MenuItem key={feed.id} value={feed.id}>{feed.name}</MenuItem>)}</Select></FormControl><TextField label="Year" type="number" value={year} onChange={(event) => setYear(event.target.value)} sx={{ width: { xs: "100%", md: 120 } }} /><FormControlLabel control={<Checkbox checked={zoteroOnly} onChange={(event) => setZoteroOnly(event.target.checked)} />} label="In Zotero" /></Stack>{message && <Alert severity="error" onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}{items.map((item) => <PaperCard key={item.id} paper={item} abstractMode="compact" actions={[]} onAction={() => undefined} onAddToZotero={() => void addToZotero(item.id).catch((error: Error) => setMessage(error.message))} />)}{!items.length && <EmptyState title="No matching papers" description="Try a different search or loosen one of the filters." />}</PageContainer>;
}
