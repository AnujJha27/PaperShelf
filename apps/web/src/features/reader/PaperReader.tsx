import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from "@mui/material";
import type { PaperAction } from "@paper-radar/shared";
import { readerSources, type PdfErrorKind, type ReaderSource, type Rect } from "./readerModel";
import { PdfDocument } from "./PdfDocument";
import { HighlightLayer, selectionRects } from "./HighlightLayer";

export function PaperReader({ sources, gatewayUrl, highlights = [], initialSourceId, initialPage = 1, initialScale = 1, initialScroll = 0, inZotero = false, onHighlight, onProgress, onState, onAddToZotero }: { sources: ReaderSource[]; gatewayUrl: string; highlights?: Array<{ source_id?: string | null; page_number: number; rects: Rect[] }>; initialSourceId?: string | null; initialPage?: number; initialScale?: number; initialScroll?: number; inZotero?: boolean; onHighlight: (rects: Rect[], selectedText: string, pageNumber: number, sourceId: string) => void; onProgress?: (state: { sourceId: string; pageNumber: number; zoom: number; scrollOffset: number }) => void; onState?: (action: PaperAction) => void; onAddToZotero?: () => void }) {
  const urls = useMemo(() => readerSources(sources, gatewayUrl), [sources, gatewayUrl]);
  const [urlIndex, setUrlIndex] = useState(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(initialScale);
  const [numPages, setNumPages] = useState<number>();
  const [rects, setRects] = useState<Rect[]>([]);
  const [textLayer, setTextLayer] = useState<HTMLElement>();
  const [failed, setFailed] = useState(false);
  const [pageError, setPageError] = useState(false);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const current = urls[urlIndex];
  useEffect(() => {
    setPageNumber(initialPage);
    setScale(initialScale);
  }, [initialPage, initialScale]);
  useEffect(() => setRects([]), [urlIndex, pageNumber]);
  useEffect(() => setUrlIndex(0), [urls]);
  useEffect(() => { setFailed(false); setPageError(false); setNumPages(undefined); }, [current?.url]);
  useEffect(() => {
    if (!initialSourceId) return;
    const index = urls.findIndex((url) => url.sourceId === initialSourceId);
    if (index >= 0) setUrlIndex(index);
  }, [initialSourceId, urls]);
  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !textLayer || !current) return;
    const range = selection.getRangeAt(0);
    const next = selectionRects(range, textLayer);
    setRects(next);
    onHighlight(next, selection.toString(), pageNumber, current.sourceId);
  }, [current?.sourceId, onHighlight, pageNumber, textLayer]);
  const handlePdfError = useCallback((kind: PdfErrorKind) => {
    if (kind === "document") {
      setUrlIndex((index) => {
        if (index >= urls.length - 1) {
          setFailed(true);
          return index;
        }
        return index + 1;
      });
      return;
    }
    if (kind === "page") {
      setPageNumber(1);
      return;
    }
    setPageError(true);
  }, [urls.length]);
  const onPageSize = useCallback(() => undefined, []);

  useEffect(() => {
    if (current) onProgress?.({ sourceId: current.sourceId, pageNumber, zoom: scale, scrollOffset: scrollContainer.current?.scrollTop ?? 0 });
  }, [current, onProgress, pageNumber, scale]);
  useEffect(() => { if (scrollContainer.current) scrollContainer.current.scrollTop = initialScroll; }, [initialScroll]);

  if (!current) return <Typography color="text.secondary">No public PDF source is available. Open the external paper link instead.</Typography>;
  return <Box component="section">
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 1.5, minWidth: 0, flexWrap: { sm: "wrap" }, alignItems: { xs: "stretch", sm: "center" } }}>
      <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel id="source-label">Source</InputLabel><Select labelId="source-label" label="Source" value={urlIndex} onChange={(event) => setUrlIndex(Number(event.target.value))}>{urls.map((url, index) => { const source = sources.find((item) => item.id === url.sourceId); return <MenuItem key={`${url.sourceId}-${url.url}`} value={index}>{source?.version_kind ?? source?.host ?? url.sourceId} · {url.url.includes("/api/pdf/") ? "proxy" : "direct"}</MenuItem>; })}</Select></FormControl><Button disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => Math.max(1, page - 1))}>Previous</Button><Typography variant="body2" color="text.secondary">Page {pageNumber}{numPages ? ` / ${numPages}` : ""}</Typography><Button disabled={numPages !== undefined && pageNumber >= numPages} onClick={() => setPageNumber((page) => numPages ? Math.min(numPages, page + 1) : page + 1)}>Next</Button><Button onClick={() => setScale((value) => Math.max(0.5, value - 0.1))} aria-label="Zoom out">−</Button><Button onClick={() => setScale((value) => Math.min(3, value + 0.1))} aria-label="Zoom in">+</Button>{current.url && <Button component="a" href={current.url} target="_blank" rel="noreferrer">Open PDF</Button>}{inZotero ? <Typography variant="caption" color="success.main">✓ In Zotero</Typography> : onAddToZotero && <Button onClick={onAddToZotero}>Save to Zotero</Button>}{onState && <><Button variant="outlined" onClick={() => onState({ type: "start_reading" })}>Start reading</Button><Button variant="contained" onClick={() => onState({ type: "mark_read" })}>Mark read</Button></>}
    </Stack>
    {failed && <Alert severity="warning" role="alert">No public PDF source could be loaded. Try an external copy: <Stack component="span" direction="row" spacing={1} sx={{ ml: 1, display: "inline-flex" }}>{sources.map((source) => <a key={source.id} href={source.landing_url ?? source.pdf_url} target="_blank" rel="noreferrer">{source.host ?? source.id}</a>)}</Stack></Alert>}
    {pageError && <Alert severity="error" role="alert" onClose={() => setPageError(false)}>This page could not be rendered. Try another page or source.</Alert>}
    <Paper ref={scrollContainer} onScroll={(event) => current && onProgress?.({ sourceId: current.sourceId, pageNumber, zoom: scale, scrollOffset: event.currentTarget.scrollTop })} onMouseUp={handleSelection} sx={{ height: { xs: "60vh", md: "calc(100vh - 250px)" }, minHeight: { md: 480 }, overflow: "auto", p: { xs: 1, sm: 2 }, bgcolor: "background.paper" }}>
      <div style={{ position: "relative", width: "max-content" }}>
        <PdfDocument url={current.url} gatewayUrl={gatewayUrl} pageNumber={pageNumber} scale={scale} onError={handlePdfError} onNumPages={setNumPages} onPageSize={onPageSize} onTextLayer={setTextLayer} />
        <HighlightLayer rects={[...highlights.filter((highlight) => highlight.source_id === current.sourceId && highlight.page_number === pageNumber).flatMap((highlight) => highlight.rects), ...rects]} />
      </div>
    </Paper>
  </Box>;
}
