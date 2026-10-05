import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, FormControl, IconButton, Tooltip, SvgIcon, InputLabel, MenuItem, Paper, Select, Stack, Typography } from "@mui/material";
import type { PaperAction } from "@paper-radar/shared";
import { clampPage, fitWidthScale, fitPageScale, readerSources, type PdfErrorKind, type ReaderSource, type Rect } from "./readerModel";
import { PdfDocument } from "./PdfDocument";
import { HighlightLayer, selectionRects } from "./HighlightLayer";

export function PaperReader({ sources, gatewayUrl, highlights = [], initialSourceId, initialPage = 1, initialScale, initialScroll = 0, inZotero = false, onHighlight, onProgress, onState, onAddToZotero }: { sources: ReaderSource[]; gatewayUrl: string; highlights?: Array<{ source_id?: string | null; page_number: number; rects: Rect[] }>; initialSourceId?: string | null; initialPage?: number; initialScale?: number; initialScroll?: number; inZotero?: boolean; onHighlight: (rects: Rect[], selectedText: string, pageNumber: number, sourceId: string) => void; onProgress?: (state: { sourceId: string; pageNumber: number; zoom: number; scrollOffset: number }) => void; onState?: (action: PaperAction) => void; onAddToZotero?: () => void }) {
  const urls = useMemo(() => readerSources(sources, gatewayUrl), [sources, gatewayUrl]);
  const [urlIndex, setUrlIndex] = useState(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(initialScale ?? 1);
  const modeKey = `papershelf:zoom-mode:${sources[0]?.id ?? ""}`;
  const [zoomMode, setZoomMode] = useState<"fit-width" | "fit-page" | "custom">(() => {
    try { const saved = localStorage.getItem(modeKey); if (saved === "fit-width" || saved === "fit-page" || saved === "custom") return saved; } catch { /* Storage may be unavailable. */ }
    return initialScale === undefined ? "fit-width" : "custom";
  });
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  const [numPages, setNumPages] = useState<number>();
  const [rects, setRects] = useState<Rect[]>([]);
  const [textLayer, setTextLayer] = useState<HTMLElement>();
  const [failed, setFailed] = useState(false);
  const [pageError, setPageError] = useState(false);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const scrollRestored = useRef(false);
  const current = urls[urlIndex];
  useEffect(() => {
    setPageNumber(initialPage);
    setScale(initialScale ?? 1);
  }, [initialPage, initialScale]);
  useEffect(() => { setRects([]); setPageError(false); }, [urlIndex, pageNumber, scale]);
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
    if (!textLayer.contains(range.commonAncestorContainer)) return;
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
      setPageNumber((page) => clampPage(page, numPages ?? 1));
      return;
    }
    setPageError(true);
  }, [urls.length, numPages]);
  const onPageSize = useCallback((size: { width: number; height: number }) => setPageSize((old) => old.width === size.width && old.height === size.height ? old : size), []);
  const handleNumPages = useCallback((count: number) => { setNumPages(count); setPageNumber((page) => clampPage(page, count)); }, []);
  useEffect(() => {
    const target = scrollContainer.current;
    if (!target) return;
    let timer: number;
    const measure = () => {
      const style = getComputedStyle(target);
      const width = target.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = target.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (width > 0 && height > 0) setPaneSize((old) => old.width === width && old.height === height ? old : { width, height });
    };
    measure();
    const observer = new ResizeObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(measure, 60); });
    observer.observe(target);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [current?.url]);
  useEffect(() => {
    if (!paneSize.width || zoomMode === "custom") return;
    setScale(zoomMode === "fit-width" ? fitWidthScale(pageSize.width, paneSize.width) : fitPageScale(pageSize.width, pageSize.height, paneSize.width, paneSize.height));
  }, [zoomMode, pageSize, paneSize]);
  useEffect(() => { try { localStorage.setItem(modeKey, zoomMode); } catch { /* Keep reading without local storage. */ } }, [modeKey, zoomMode]);
  const handleTextLayer = useCallback((element: HTMLElement) => {
    if (!scrollRestored.current && scrollContainer.current) {
      scrollContainer.current.scrollTop = initialScroll;
      scrollRestored.current = true;
    }
    setTextLayer(element);
  }, [initialScroll]);
  const changeZoom = (value: number) => { setZoomMode("custom"); setScale(Math.max(0.1, Math.min(3, value))); };


  useEffect(() => {
    if (current && numPages && scrollRestored.current) onProgress?.({ sourceId: current.sourceId, pageNumber, zoom: scale, scrollOffset: scrollContainer.current?.scrollTop ?? 0 });
  }, [current, onProgress, pageNumber, scale, numPages, textLayer]);
  useEffect(() => { scrollRestored.current = false; }, [initialScroll]);

  if (!current) return <Typography color="text.secondary">No public PDF source is available. Open the external paper link instead.</Typography>;
  return <Box component="section">
    <Stack direction="row" spacing={1} sx={{ mb: 1.5, minWidth: 0, flexWrap: "wrap", alignItems: "center" }}>
      <FormControl size="small" sx={{ minWidth: 130 }}><InputLabel id="source-label">Source</InputLabel><Select labelId="source-label" label="Source" value={urlIndex} onChange={(event) => setUrlIndex(Number(event.target.value))}>{urls.map((url, index) => { const source = sources.find((item) => item.id === url.sourceId); return <MenuItem key={`${url.sourceId}-${url.url}`} value={index}>{source?.version_kind ?? source?.host ?? url.sourceId} · {url.url.includes("/api/pdf/") ? "proxy" : "direct"}</MenuItem>; })}</Select></FormControl><Tooltip title="Previous page"><span><IconButton sx={{ minWidth: 44, minHeight: 44 }} aria-label="Previous" disabled={pageNumber <= 1 || !numPages} onClick={() => setPageNumber((page) => clampPage(page - 1, numPages!))}><SvgIcon><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" /></SvgIcon></IconButton></span></Tooltip>
      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>Page {pageNumber}{numPages ? ` / ${numPages}` : ""}</Typography>
      <Tooltip title="Next page"><span><IconButton sx={{ minWidth: 44, minHeight: 44 }} aria-label="Next" disabled={!numPages || pageNumber >= numPages} onClick={() => setPageNumber((page) => clampPage(page + 1, numPages!))}><SvgIcon><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" /></SvgIcon></IconButton></span></Tooltip>
      <FormControl size="small" sx={{ minWidth: 120 }}><InputLabel id="zoom-label">Zoom</InputLabel><Select labelId="zoom-label" label="Zoom" value={zoomMode === "custom" ? ([1, 1.25, 1.5].includes(scale) ? String(scale) : "custom") : zoomMode} onChange={(event) => { const value = event.target.value; if (value === "fit-width" || value === "fit-page") setZoomMode(value); else if (value !== "custom") changeZoom(Number(value)); }}><MenuItem value="fit-width">Fit width</MenuItem><MenuItem value="fit-page">Fit page</MenuItem><MenuItem value="1">100%</MenuItem><MenuItem value="1.25">125%</MenuItem><MenuItem value="1.5">150%</MenuItem><MenuItem value="custom" disabled>Custom</MenuItem></Select></FormControl>
      <Tooltip title="Zoom out"><span><IconButton sx={{ minWidth: 44, minHeight: 44 }} aria-label="Zoom out" disabled={scale <= 0.1} onClick={() => changeZoom(scale - 0.1)}><SvgIcon><path d="M5 12h14" stroke="currentColor" strokeWidth="2" /></SvgIcon></IconButton></span></Tooltip><Typography variant="body2">{Math.round(scale * 100)}%</Typography><Tooltip title="Zoom in"><span><IconButton sx={{ minWidth: 44, minHeight: 44 }} aria-label="Zoom in" disabled={scale >= 3} onClick={() => changeZoom(scale + 0.1)}><SvgIcon><path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="2" /></SvgIcon></IconButton></span></Tooltip>{current.url && <Button component="a" href={current.url} target="_blank" rel="noreferrer">Open PDF</Button>}{inZotero ? <Typography variant="caption" color="success.main">✓ In Zotero</Typography> : onAddToZotero && <Button onClick={onAddToZotero}>Save to Zotero</Button>}{onState && <><Button variant="outlined" onClick={() => onState({ type: "start_reading" })}>Start reading</Button><Button variant="contained" onClick={() => onState({ type: "mark_read" })}>Mark read</Button></>}
    </Stack>
    {failed && <Alert severity="warning" role="alert">No public PDF source could be loaded. Try an external copy: <Stack component="span" direction="row" spacing={1} sx={{ ml: 1, display: "inline-flex" }}>{sources.map((source) => <a key={source.id} href={source.landing_url ?? source.pdf_url} target="_blank" rel="noreferrer">{source.host ?? source.id}</a>)}</Stack></Alert>}
    {pageError && <Alert severity="error" role="alert" onClose={() => setPageError(false)}>This page could not be rendered. Try another page or source.</Alert>}
    <Paper ref={scrollContainer} onScroll={(event) => current && numPages && scrollRestored.current && onProgress?.({ sourceId: current.sourceId, pageNumber, zoom: scale, scrollOffset: event.currentTarget.scrollTop })} onMouseUp={handleSelection} sx={{ height: { xs: "60vh", md: "calc(100vh - 250px)" }, minHeight: { md: 480 }, overflow: "auto", scrollbarGutter: "stable", p: { xs: 1, sm: 2 }, bgcolor: "background.paper" }}>
      <div style={{ position: "relative", width: "max-content" }}>
        <PdfDocument url={current.url} gatewayUrl={gatewayUrl} pageNumber={pageNumber} scale={scale} onError={handlePdfError} onNumPages={handleNumPages} onPageSize={onPageSize} onTextLayer={handleTextLayer} />
        <HighlightLayer rects={[...highlights.filter((highlight) => highlight.source_id === current.sourceId && highlight.page_number === pageNumber).flatMap((highlight) => highlight.rects), ...rects]} />
      </div>
    </Paper>
  </Box>;
}
