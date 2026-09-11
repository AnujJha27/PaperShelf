import { useEffect, useState } from "react";
import { Alert, Box, Divider, Stack, TextField, Typography } from "@mui/material";
import type { Paper, PaperAction, PaperState } from "@paper-radar/shared";
import { addToZotero, listPapersByStatus, listRejectedHistory, updatePaperState, type HistoryPaper } from "../../lib/api";
import { PaperCard } from "../papers/PaperCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageContainer } from "../../components/layout/PageContainer";
import { PageHeader } from "../../components/layout/PageHeader";
import { SectionHeader } from "../../components/ui/SectionHeader";

export function StatusPage({ status, title, actions, groupQueue = false }: { status: PaperState["status"]; title: string; actions: PaperAction["type"][]; groupQueue?: boolean }) {
  const [items, setItems] = useState<HistoryPaper[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  async function load() { try { setItems(status === "rejected" ? await listRejectedHistory() : await listPapersByStatus(status)); } catch (error) { setMessage((error as Error).message); } }
  useEffect(() => { void load(); }, [status]);
  async function act(paper: Paper, action: PaperAction) {
    try { await updatePaperState(paper.id, action); await load(); } catch (error) { setMessage((error as Error).message); }
  }
  const card = (item: HistoryPaper) => <Box key={item.id}>{status === "rejected" && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>Rejected {item.state.rejected_at ? new Date(item.state.rejected_at).toLocaleDateString() : "date unavailable"}{item.originating_feeds?.length ? ` · From: ${item.originating_feeds.join(", ")}` : ""}</Typography>}<PaperCard paper={item} reason={item.reason_text} score={item.recommendation_score} onAction={(action) => void act(item, action)} onAddToZotero={() => void addToZotero(item.id).catch((error: Error) => setMessage(error.message))} actions={actions} /></Box>;
  const visible = query.trim() ? items.filter((item) => `${item.title} ${item.abstract ?? ""} ${item.reason_text ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) : items;
  return <PageContainer><PageHeader title={title} description={status === "queue" ? "Keep promising papers close, without turning your reading list into a backlog." : status === "reading" ? "Papers you’ve started and want to finish." : "A recoverable history of papers you passed on."} />{message && <Alert severity="error" onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}{status === "rejected" && <TextField label="Search rejected papers" value={query} onChange={(event) => setQuery(event.target.value)} sx={{ mb: 3, width: { xs: "100%", sm: 360 } }} />}{groupQueue ? <Stack spacing={3}>{(["relevant", "maybe"] as const).map((priority) => { const group = visible.filter((item) => item.state.queue_priority === priority); return <Box key={priority}><SectionHeader title={priority === "relevant" ? "Relevant" : "Maybe"} count={group.length} />{group.length ? group.map(card) : <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>Nothing here yet.</Typography>}{priority === "relevant" && <Divider sx={{ mt: 2 }} />}</Box>; })}</Stack> : visible.map(card)}{!visible.length && <EmptyState title={status === "rejected" ? "No rejected papers" : `No ${title.toLowerCase()} papers`} description="This space will fill in as you work through your radar." />}</PageContainer>;
}
