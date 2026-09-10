import { useEffect, useState } from "react";
import type { Paper, PaperState } from "@paper-radar/shared";
import { addToZotero, listFeeds, searchLibrary } from "../../lib/api";
import { PaperCard } from "../papers/PaperCard";

export function LibraryPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Array<Paper & { state: PaperState }>>([]);
  const [message, setMessage] = useState("");
  const [feeds, setFeeds] = useState<Array<{ id: string; name: string }>>([]);
  const [feedId, setFeedId] = useState<string>();
  const [year, setYear] = useState<string>("");
  const [zoteroOnly, setZoteroOnly] = useState(false);
  useEffect(() => { void listFeeds().then(setFeeds).catch((error: Error) => setMessage(error.message)); }, []);
  useEffect(() => { void searchLibrary(query, { feedId, year: year ? Number(year) : undefined, zoteroOnly }).then(setItems).catch((error: Error) => setMessage(error.message)); }, [query, feedId, year, zoteroOnly]);
  return <main><h1>Library</h1><label>Search papers and typed notes <input value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>Feed <select value={feedId ?? ""} onChange={(event) => setFeedId(event.target.value || undefined)}><option value="">All feeds</option>{feeds.map((feed) => <option key={feed.id} value={feed.id}>{feed.name}</option>)}</select></label><label>Year <input type="number" value={year} onChange={(event) => setYear(event.target.value)} /></label><label><input type="checkbox" checked={zoteroOnly} onChange={(event) => setZoteroOnly(event.target.checked)} /> In Zotero</label><p role="status">{message}</p>{items.map((item) => <PaperCard key={item.id} paper={item} actions={[]} onAction={() => undefined} onAddToZotero={() => void addToZotero(item.id).catch((error: Error) => setMessage(error.message))} />)}{!items.length && <p>No matching papers.</p>}</main>;
}
