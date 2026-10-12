import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, ButtonGroup, Paper as MuiPaper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import type { PaperAction } from "@paper-radar/shared";
import { addToZotero, deleteHighlight, getPaper, getReaderState, listHighlights, listPaperSources, saveHighlight, saveReaderState, updatePaperState, type PaperSource, type PdfHighlight, type ReaderState } from "../../lib/api";
import type { Paper } from "@paper-radar/shared";
import { PaperReader } from "./PaperReader";
import { CleanReadPanel, type CleanReadHandle } from "./CleanReadPanel";
import type { ReaderFocus } from "./PaperReader";
import { Notebook } from "../notebook/Notebook";
import type { NotebookQuote, PaperSourceAnchor } from "../notebook/notebookModel";
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
  const [readerView, setReaderView] = useState<"pdf" | "clean">("pdf");
  const [pdfFocus, setPdfFocus] = useState<ReaderFocus | null>(null);
  const [pendingQuote, setPendingQuote] = useState<NotebookQuote | null>(null);
  const [message, setMessage] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"pdf" | "read" | "notes">("pdf");
  const cleanReadRef = useRef<CleanReadHandle>(null);
  const activeSource = sources.find((source) => source.id === readerState?.source_id) ?? sources[0] ?? null;
  useEffect(() => {
    void Promise.all([listPaperSources(paperId), listHighlights(paperId), getReaderState(paperId), getPaper(paperId)]).then(([nextSources, nextHighlights, nextReaderState, nextPaper]) => { setSources(nextSources); setHighlights(nextHighlights); setReaderState(nextReaderState); setPaper(nextPaper); setPaperUrl(nextPaper.canonical_url); }).catch((error: Error) => setMessage(error.message));
  }, [paperId]);
  useEffect(() => { setReaderView("pdf"); setMobilePanel("pdf"); setPdfFocus(null); setPendingQuote(null); }, [paperId]);
  async function onState(action: PaperAction) { try { await updatePaperState(paperId, action); } catch (error) { setMessage((error as Error).message); } }
  async function copy(value: string, label: string) { try { await navigator.clipboard.writeText(value); setMessage(`${label} copied`); } catch { setMessage(`Could not copy ${label.toLowerCase()}`); } }
  async function onHighlight(rects: Array<{ x: number; y: number; width: number; height: number }>, selectedText: string, pageNumber: number, sourceId: string) { try { const saved = await saveHighlight(paperId, pageNumber, rects, selectedText, sourceId); setHighlights((current) => [...current, saved]); } catch (error) { setMessage((error as Error).message); } }
  const saveTimer = useRef<number | undefined>(undefined);
  const onProgress = useCallback((next: { sourceId: string; pageNumber: number; zoom: number; scrollOffset: number }) => {
    setReaderState({ source_id: next.sourceId, page_number: next.pageNumber, zoom: next.zoom, scroll_offset: next.scrollOffset });
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveReaderState(paperId, { source_id: next.sourceId, page_number: next.pageNumber, zoom: next.zoom, scroll_offset: next.scrollOffset }).catch((error: Error) => setMessage(error.message)), 500);
  }, [paperId]);
  async function removeHighlight(id: string) { try { await deleteHighlight(id); setHighlights((current) => current.filter((highlight) => highlight.id !== id)); } catch (error) { setMessage((error as Error).message); } }
  const citation = paper && `${(Array.isArray(paper.authors) ? paper.authors : []).map((author) => typeof author === "string" ? author : author.display_name ?? author.name ?? "").filter(Boolean).join(", ")}. ${paper.title}. ${paper.venue ?? ""} (${paper.publication_year ?? "n.d."}).`;
  const showPdf = () => { setReaderView("pdf"); setMobilePanel("pdf"); };
  const showCleanRead = () => { setReaderView("clean"); setMobilePanel("read"); void cleanReadRef.current?.open(); };
  function addToNotebook(quote: NotebookQuote) { setPendingQuote(quote); setMobilePanel("notes"); }
  function openNotebookSource(anchor: PaperSourceAnchor) {
    setReaderView("clean"); setMobilePanel("read"); void cleanReadRef.current?.openAnchor(anchor);
  }
  return <PageContainer wide><PageHeader title="Paper reader" description={paper?.title} action={<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>{paper?.doi && <Button variant="text" onClick={() => void copy(paper.doi!, "DOI")}>Copy DOI</Button>}{citation && <Button variant="text" onClick={() => void copy(citation, "Citation")}>Copy citation</Button>}{paperUrl && <Button component="a" href={paperUrl} target="_blank" rel="noreferrer">Open paper</Button>}<Button variant="outlined" onClick={() => setNotebookVisible((visible) => !visible)}>{notebookVisible ? "Hide notebook" : "Show notebook"}</Button></Stack>} />
    <ButtonGroup size="small" sx={{ display: { xs: "none", lg: "inline-flex" }, mb: 2 }} aria-label="Paper view"><Button variant={readerView === "pdf" ? "contained" : "outlined"} onClick={showPdf}>PDF</Button><Button variant={readerView === "clean" ? "contained" : "outlined"} onClick={showCleanRead}>Clean Read</Button></ButtonGroup>
    {message && <Alert severity="error" onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}{!sources.length && paperUrl && <Alert severity="info" sx={{ mb: 2 }}>No public PDF is available. <a href={paperUrl} target="_blank" rel="noreferrer">Open the paper externally</a>.</Alert>}
    <Tabs value={mobilePanel} onChange={(_, value: "pdf" | "read" | "notes") => { if (value === "read") showCleanRead(); else if (value === "pdf") showPdf(); else setMobilePanel(value); }} sx={{ display: { xs: "flex", lg: "none" }, mb: 2 }}><Tab value="pdf" label="PDF" /><Tab value="read" label="Read" /><Tab value="notes" label="Notes" /></Tabs>
    <Box className="reader-split" sx={{ gridTemplateColumns: { xs: "1fr", lg: notebookVisible ? "minmax(0, 1fr) minmax(0, 1fr)" : "1fr" } }}>
      <Box sx={{ display: { xs: mobilePanel === "pdf" ? "block" : "none", lg: readerView === "pdf" ? "block" : "none" }, minWidth: 0 }}><PaperReader key={`${paperId}:${sources[0]?.id ?? "loading"}`} sources={sources} gatewayUrl={import.meta.env.VITE_GATEWAY_URL as string | undefined ?? ""} highlights={highlights} initialSourceId={readerState?.source_id} initialPage={readerState?.page_number} initialScale={readerState?.zoom} initialScroll={readerState?.scroll_offset} focus={pdfFocus} inZotero={paper?.in_zotero} onHighlight={onHighlight} onProgress={onProgress} onState={onState} onAddToZotero={() => void addToZotero(paperId).then(() => setPaper((current) => current ? { ...current, in_zotero: true } : current)).catch((error: Error) => setMessage(error.message))} /></Box>
      <Box sx={{ display: { xs: mobilePanel === "read" ? "block" : "none", lg: readerView === "clean" ? "block" : "none" }, minWidth: 0 }}><CleanReadPanel ref={cleanReadRef} paperId={paperId} paper={paper} source={activeSource} onViewPdf={(focus) => { setPdfFocus(focus); showPdf(); }} onAddToNotes={addToNotebook} onHighlightSaved={(saved) => setHighlights((current) => [...current, saved])} /></Box>
      <Box sx={{ display: { xs: notebookVisible && mobilePanel === "notes" ? "block" : "none", lg: notebookVisible ? "block" : "none" }, minWidth: 0, position: { lg: "sticky" }, top: { lg: 16 }, maxHeight: { lg: "calc(100vh - 32px)" }, overflowY: { lg: "auto" } }}><Notebook key={paperId} paperId={paperId} pendingQuote={pendingQuote} onOpenSource={openNotebookSource} /></Box>
    </Box>
    <MuiPaper component="aside" sx={{ mt: 3, p: 2 }}><Typography variant="h2" component="h2" sx={{ mb: 1.5 }}>Highlights</Typography>{highlights.length ? <Stack spacing={1.5}>{highlights.map((highlight) => <Stack key={highlight.id} direction="row" sx={{ justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}><Typography variant="body2">{highlight.selected_text}</Typography><Button size="small" color="error" onClick={() => void removeHighlight(highlight.id)}>Delete</Button></Stack>)}</Stack> : <Typography variant="body2" color="text.secondary">Select text in the paper to save a highlight.</Typography>}</MuiPaper>
  </PageContainer>;
}
