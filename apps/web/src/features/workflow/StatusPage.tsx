import { useEffect, useState } from "react";
import type { Paper, PaperAction, PaperState } from "@paper-radar/shared";
import { addToZotero, listPapersByStatus, listRejectedHistory, updatePaperState, type HistoryPaper } from "../../lib/api";
import { PaperCard } from "../papers/PaperCard";

export function StatusPage({ status, title, actions, groupQueue = false }: { status: PaperState["status"]; title: string; actions: PaperAction["type"][]; groupQueue?: boolean }) {
  const [items, setItems] = useState<HistoryPaper[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  async function load() { try { setItems(status === "rejected" ? await listRejectedHistory() : await listPapersByStatus(status)); } catch (error) { setMessage((error as Error).message); } }
  useEffect(() => { void load(); }, [status]);
  async function act(paper: Paper, action: PaperAction) {
    try { await updatePaperState(paper.id, action); await load(); } catch (error) { setMessage((error as Error).message); }
  }
  const card = (item: HistoryPaper) => <div key={item.id}>{status === "rejected" && <p>Rejected {item.state.rejected_at ? new Date(item.state.rejected_at).toLocaleDateString() : "date unavailable"}{item.originating_feeds?.length ? ` · From: ${item.originating_feeds.join(", ")}` : ""}</p>}<PaperCard paper={item} reason={item.reason_text} score={item.recommendation_score} onAction={(action) => void act(item, action)} onAddToZotero={() => void addToZotero(item.id).catch((error: Error) => setMessage(error.message))} actions={actions} /></div>;
  const visible = query.trim() ? items.filter((item) => `${item.title} ${item.abstract ?? ""} ${item.reason_text ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) : items;
  return <main><h1>{title}</h1><p role="status">{message}</p>{status === "rejected" && <label>Search rejected papers <input value={query} onChange={(event) => setQuery(event.target.value)} /></label>}{groupQueue ? <>{(["relevant", "maybe"] as const).map((priority) => <section key={priority}><h2>{priority === "relevant" ? "Relevant" : "Maybe"}</h2>{visible.filter((item) => item.state.queue_priority === priority).map(card)}</section>)}</> : visible.map(card)}{!visible.length && <p>No papers here yet.</p>}</main>;
}
