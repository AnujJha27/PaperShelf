import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Paper as MuiPaper, Stack, Tab, Tabs, Typography } from "@mui/material";
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
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [message, setMessage] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"paper" | "notes">("paper");
  useEffect(() => {
    void Promise.all([listPaperSources(paperId), listHighlights(paperId), getReaderState(paperId), getPaper(paperId)]).then(([nextSources, nextHighlights, nextReaderState, nextPaper]) => { setSources(nextSources); setHighlights(nextHighlights); setReaderState(nextReaderState); setPaper(nextPaper); setPaperUrl(nextPaper.canonical_url); }).catch((error: Error) => setMessage(error.message));
  }, [paperId]);
  async function onState(action: PaperAction) { try { await updatePaperState(paperId, action); } catch (error) { setMessage((error as Error).message); } }
  async function copy(value: string, label: string) { try { await navigator.clipboard.writeText(value); setMessage(`${label} copied`); } catch { setMessage(`Could not copy ${label.toLowerCase()}`); } }
  async function onHighlight(rects: Array<{ x: number; y: number; width: number; height: number }>, selectedText: string, pageNumber: number, sourceId: string) { try { const saved = await saveHighlight(paperId, pageNumber, rects, selectedText, sourceId); setHighlights((current) => [...current, saved]); } catch (error) { setMessage((error as Error).message); } }
  const saveTimer = useRef<number | undefined>(undefined);
  const onProgress = useCallback((next: { sourceId: string; pageNumber: number; zoom: number; scrollOffset: number }) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveReaderState(paperId, { source_id: next.sourceId, page_number: next.pageNumber, zoom: next.zoom, scroll_offset: next.scrollOffset }).catch((error: Error) => setMessage(error.message)), 500);
  }, [paperId]);
  async function removeHighlight(id: string) { try { await deleteHighlight(id); setHighlights((current) => current.filter((highlight) => highlight.id !== id)); } catch (error) { setMessage((error as Error).message); } }
  const citation = paper && `${paper.authors.map((author) => typeof author === "string" ? author : author.display_name ?? author.name ?? "").filter(Boolean).join(", ")}. ${paper.title}. ${paper.venue ?? ""} (${paper.publication_year ?? "n.d."}).`;
  return <PageContainer wide><PageHeader title="Paper reader" description={paper?.title} action={<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>{paper?.doi && <Button variant="text" onClick={() => void copy(paper.doi!, "DOI")}>Copy DOI</Button>}{citation && <Button variant="text" onClick={() => void copy(citation, "Citation")}>Copy citation</Button>}{paperUrl && <Button component="a" href={paperUrl} target="_blank" rel="noreferrer">Open paper</Button>}<Button variant="outlined" onClick={() => setNotebookVisible((visible) => !visible)}>{notebookVisible ? "Hide notebook" : "Show notebook"}</Button></Stack>} />{message && <Alert severity="error" onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}{!sources.length && paperUrl && <Alert severity="info" sx={{ mb: 2 }}>No public PDF is available. <a href={paperUrl} target="_blank" rel="noreferrer">Open the paper externally</a>.</Alert>}<Tabs value={mobilePanel} onChange={(_, value: "paper" | "notes") => setMobilePanel(value)} sx={{ display: { xs: "flex", md: "none" }, mb: 2 }}><Tab value="paper" label="Paper" /><Tab value="notes" label="Notes" /></Tabs><Box className="reader-split" sx={{ gridTemplateColumns: notebookVisible ? "minmax(0, 1fr) minmax(0, 1fr)" : "1fr" }}><Box sx={{ display: { xs: mobilePanel === "paper" ? "block" : "none", md: "block" }, minWidth: 0 }}><PaperReader sources={sources} gatewayUrl={import.meta.env.VITE_GATEWAY_URL as string | undefined ?? ""} highlights={highlights} initialSourceId={readerState?.source_id} initialPage={readerState?.page_number} initialScale={readerState?.zoom} initialScroll={readerState?.scroll_offset} inZotero={paper?.in_zotero} onHighlight={onHighlight} onProgress={onProgress} onState={onState} onAddToZotero={() => void addToZotero(paperId).then(() => setPaper((current) => current ? { ...current, in_zotero: true } : current)).catch((error: Error) => setMessage(error.message))} /></Box>{notebookVisible && <Box sx={{ display: { xs: mobilePanel === "notes" ? "block" : "none", md: "block" }, minWidth: 0 }}><Notebook paperId={paperId} /></Box>}</Box><MuiPaper component="aside" sx={{ mt: 3, p: 2 }}><Typography variant="h2" component="h2" sx={{ mb: 1.5 }}>Highlights</Typography>{highlights.length ? <Stack spacing={1.5}>{highlights.map((highlight) => <Stack key={highlight.id} direction="row" sx={{ justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}><Typography variant="body2">{highlight.selected_text}</Typography><Button size="small" color="error" onClick={() => void removeHighlight(highlight.id)}>Delete</Button></Stack>)}</Stack> : <Typography variant="body2" color="text.secondary">Select text in the paper to save a highlight.</Typography>}</MuiPaper></PageContainer>;
}
