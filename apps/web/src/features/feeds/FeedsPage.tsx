import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Feed, FeedInput } from "@paper-radar/shared";
import { getFeedModelStatuses, listFeeds, saveFeed, setFeedActive } from "../../lib/api";
import type { FeedModelStatus } from "./modelStatus";

const empty: FeedInput = { name: "", description: "", include_keywords: "", exclude_keywords: "", priority_keywords: "" };

export function FeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [form, setForm] = useState<FeedInput>(empty);
  const [editing, setEditing] = useState<string>();
  const [modelStatuses, setModelStatuses] = useState<Record<string, FeedModelStatus>>({});
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const nextFeeds = await listFeeds();
      setFeeds(nextFeeds);
      setModelStatuses(await getFeedModelStatuses(nextFeeds.map((feed) => feed.id)));
    } catch (error) { setMessage((error as Error).message); }
  }
  useEffect(() => { void load(); }, []);

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
    });
  }

  return (
    <main>
      <h1>Feeds</h1>
      <form onSubmit={submit}>
        <label>Name <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Description <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label>Include keywords <input value={form.include_keywords} onChange={(event) => setForm({ ...form, include_keywords: event.target.value })} /></label>
        <label>Exclude keywords <input value={form.exclude_keywords} onChange={(event) => setForm({ ...form, exclude_keywords: event.target.value })} /></label>
        <label>Priority keywords <input value={form.priority_keywords} onChange={(event) => setForm({ ...form, priority_keywords: event.target.value })} /></label>
        <label>Minimum semantic similarity <input type="range" min="0" max="1" step="0.01" value={form.min_semantic_similarity ?? 0.35} onChange={(event) => setForm({ ...form, min_semantic_similarity: Number(event.target.value) })} /> <output>{(form.min_semantic_similarity ?? 0.35).toFixed(2)}</output></label>
        <button type="submit">{editing ? "Save feed" : "Create feed"}</button>
        {editing && <button type="button" onClick={() => { setEditing(undefined); setForm(empty); }}>Cancel</button>}
      </form>
      <p role="status">{message}</p>
      <ul>
        {feeds.map((feed) => <li key={feed.id}>
          <strong>{feed.name}</strong> — {feed.description}
          <small> · Model: {modelStatuses[feed.id]?.status ?? "Cold start"} · labels {modelStatuses[feed.id]?.total ?? 0} (Relevant {modelStatuses[feed.id]?.relevant ?? 0}, Maybe {modelStatuses[feed.id]?.maybe ?? 0}, Not relevant {modelStatuses[feed.id]?.notRelevant ?? 0})</small>
          <Link to={`/?feed=${encodeURIComponent(feed.id)}`}>Open Today</Link>
          <button onClick={() => edit(feed)}>Edit</button>
          <button onClick={() => void setFeedActive(feed.id, !feed.is_active).then(() => setFeeds((current) => current.map((item) => item.id === feed.id ? { ...item, is_active: !item.is_active } : item))).catch((error: Error) => setMessage(error.message))}>
            {feed.is_active ? "Archive" : "Activate"}
          </button>
        </li>)}
      </ul>
    </main>
  );
}
