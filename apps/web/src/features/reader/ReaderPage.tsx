import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Alert, Box, Button, Paper as MuiPaper, Slider, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import type { PaperAction } from "@paper-radar/shared";
import { addToZotero, deleteHighlight, getPaper, getReaderState, listHighlights, listPaperSources, saveHighlight, saveReaderState, updatePaperState, type PaperSource, type PdfHighlight, type ReaderState } from "../../lib/api";
import type { Paper } from "@paper-radar/shared";
import { PaperReader } from "./PaperReader";
import { Notebook } from "../notebook/Notebook";
import { PageContainer } from "../../components/layout/PageContainer";
import { PageHeader } from "../../components/layout/PageHeader";

export function ReaderPage() {
  const { paperId = "" } = useParams();
  const [sources, setSources] = useState<PaperSource[]>([]);
  const [paperUrl, setPaperUrl] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [notebookVisible, setNotebookVisible] = useState(true);
  const [notebookWidth, setNotebookWidth] = useState(38);
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [message, setMessage] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"paper" | "notes">("paper");
  const draggingDivider = useRef(false);
  useEffect(() => {
    void Promise.all([listPaperSources(paperId), listHighlights(paperId), getReaderState(paperId), getPaper(paperId)]).then(([nextSources, nextHighlights, nextReaderState, nextPaper]) => { setSources(nextSources); setHighlights(nextHighlights); setReaderState(nextReaderState); setPaper(nextPaper); setPaperUrl(nextPaper.canonical_url); }).catch((error: Error) => setMessage(error.message));
  }, [paperId]);
  async function onState(action: PaperAction) { try { await updatePaperState(paperId, action); } catch (error) { setMessage((error as Error).message); } }
  async function onHighlight(rects: Array<{ x: number; y: number; width: number; height: number }>, selectedText: string, pageNumber: number, sourceId: string) { try { const saved = await saveHighlight(paperId, pageNumber, rects, selectedText, sourceId); setHighlights((current) => [...current, saved]); } catch (error) { setMessage((error as Error).message); } }
  const saveTimer = useRef<number | undefined>(undefined);
  const onProgress = useCallback((next: { sourceId: string; pageNumber: number; zoom: number; scrollOffset: number }) => {
    setReaderState({ source_id: next.sourceId, page_number: next.pageNumber, zoom: next.zoom, scroll_offset: next.scrollOffset });
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveReaderState(paperId, { source_id: next.sourceId, page_number: next.pageNumber, zoom: next.zoom, scroll_offset: next.scrollOffset }).catch((error: Error) => setMessage(error.message)), 500);
  }, [paperId]);
  async function removeHighlight(id: string) { try { await deleteHighlight(id); setHighlights((current) => current.filter((highlight) => highlight.id !== id)); } catch (error) { setMessage((error as Error).message); } }
  function startDividerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingDivider.current = true;
  }
  function moveDivider(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingDivider.current) return;
    setNotebookWidth(Math.min(60, Math.max(25, ((window.innerWidth - event.clientX) / window.innerWidth) * 100)));
  }
  function endDividerDrag() { draggingDivider.current = false; }
  return <PageContainer><PageHeader title="Paper reader" description={paper?.title} action={<Button variant="outlined" onClick={() => setNotebookVisible((visible) => !visible)}>{notebookVisible ? "Hide notebook" : "Show notebook"}</Button>} />{message && <Alert severity="error" onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}{!sources.length && paperUrl && <Alert severity="info" sx={{ mb: 2 }}>No public PDF is available. <a href={paperUrl} target="_blank" rel="noreferrer">Open the paper externally</a>.</Alert>}{notebookVisible && <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2, alignItems: { xs: "stretch", md: "center" } }}><Typography variant="body2" color="text.secondary">Notebook width</Typography><Slider aria-label="Notebook width" min={25} max={60} value={notebookWidth} onChange={(_, value) => setNotebookWidth(value as number)} sx={{ maxWidth: 320 }} /><Typography variant="caption" color="text.secondary">{notebookWidth}%</Typography></Stack>}<Tabs value={mobilePanel} onChange={(_, value: "paper" | "notes") => setMobilePanel(value)} sx={{ display: { xs: "flex", md: "none" }, mb: 2 }}><Tab value="paper" label="Paper" /><Tab value="notes" label="Notes" /></Tabs><Box className="reader-split" sx={{ gridTemplateColumns: notebookVisible ? `minmax(0, 1fr) 8px minmax(280px, ${notebookWidth}%)` : "1fr" }}><Box sx={{ display: { xs: mobilePanel === "paper" ? "block" : "none", md: "block" }, minWidth: 0 }}><PaperReader sources={sources} gatewayUrl={import.meta.env.VITE_GATEWAY_URL as string | undefined ?? ""} highlights={highlights} initialSourceId={readerState?.source_id} initialPage={readerState?.page_number} initialScale={readerState?.zoom} initialScroll={readerState?.scroll_offset} inZotero={paper?.in_zotero} onHighlight={onHighlight} onProgress={onProgress} onState={onState} onAddToZotero={() => void addToZotero(paperId).then(() => setPaper((current) => current ? { ...current, in_zotero: true } : current)).catch((error: Error) => setMessage(error.message))} /></Box>{notebookVisible && <Box className="reader-divider" role="separator" aria-label="Resize notebook" aria-valuemin={25} aria-valuemax={60} aria-valuenow={notebookWidth} tabIndex={0} onPointerDown={startDividerDrag} onPointerMove={moveDivider} onPointerUp={endDividerDrag} onPointerCancel={endDividerDrag} onKeyDown={(event) => { if (event.key === "ArrowLeft") setNotebookWidth((value) => Math.min(60, value + 2)); if (event.key === "ArrowRight") setNotebookWidth((value) => Math.max(25, value - 2)); }} sx={{ display: { xs: "none", md: "block" }, bgcolor: "divider", borderRadius: 1, minHeight: 120 }} />}{notebookVisible && <Box sx={{ display: { xs: mobilePanel === "notes" ? "block" : "none", md: "block" }, minWidth: 0 }}><Notebook paperId={paperId} /></Box>}</Box><MuiPaper component="aside" sx={{ mt: 3, p: 2 }}><Typography variant="h2" component="h2" sx={{ mb: 1.5 }}>Highlights</Typography>{highlights.length ? <Stack spacing={1.5}>{highlights.map((highlight) => <Stack key={highlight.id} direction="row" sx={{ justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}><Typography variant="body2">{highlight.selected_text}</Typography><Button size="small" color="error" onClick={() => void removeHighlight(highlight.id)}>Delete</Button></Stack>)}</Stack> : <Typography variant="body2" color="text.secondary">Select text in the paper to save a highlight.</Typography>}</MuiPaper></PageContainer>;
}
