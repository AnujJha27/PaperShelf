import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaperAction } from "@paper-radar/shared";
import { readerSources, type ReaderSource, type Rect } from "./readerModel";
import { PdfDocument } from "./PdfDocument";
import { HighlightLayer, selectionRects } from "./HighlightLayer";

export function PaperReader({ sources, gatewayUrl, highlights = [], initialSourceId, initialPage = 1, initialScale = 1, initialScroll = 0, inZotero = false, onHighlight, onProgress, onState, onAddToZotero }: { sources: ReaderSource[]; gatewayUrl: string; highlights?: Array<{ source_id?: string | null; page_number: number; rects: Rect[] }>; initialSourceId?: string | null; initialPage?: number; initialScale?: number; initialScroll?: number; inZotero?: boolean; onHighlight: (rects: Rect[], selectedText: string, pageNumber: number, sourceId: string) => void; onProgress?: (state: { sourceId: string; pageNumber: number; zoom: number; scrollOffset: number }) => void; onState?: (action: PaperAction) => void; onAddToZotero?: () => void }) {
  const urls = useMemo(() => readerSources(sources, gatewayUrl), [sources, gatewayUrl]);
  const [urlIndex, setUrlIndex] = useState(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(initialScale);
  const [rects, setRects] = useState<Rect[]>([]);
  const [textLayer, setTextLayer] = useState<HTMLElement>();
  const [failed, setFailed] = useState(false);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const current = urls[urlIndex];
  useEffect(() => {
    setPageNumber(initialPage);
    setScale(initialScale);
  }, [initialPage, initialScale]);
  useEffect(() => setRects([]), [urlIndex, pageNumber]);
  useEffect(() => setUrlIndex(0), [urls]);
  useEffect(() => setFailed(false), [current?.url]);
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

  useEffect(() => {
    if (current) onProgress?.({ sourceId: current.sourceId, pageNumber, zoom: scale, scrollOffset: scrollContainer.current?.scrollTop ?? 0 });
  }, [current, onProgress, pageNumber, scale]);
  useEffect(() => { if (scrollContainer.current) scrollContainer.current.scrollTop = initialScroll; }, [initialScroll]);

  if (!current) return <p>No public PDF source is available. Open the external paper link instead.</p>;
  const advanceSource = () => setUrlIndex((index) => { if (index >= urls.length - 1) setFailed(true); return Math.min(index + 1, urls.length - 1); });
  return <main>
    <header>
      <label>Source <select value={urlIndex} onChange={(event) => setUrlIndex(Number(event.target.value))}>{urls.map((url, index) => { const source = sources.find((item) => item.id === url.sourceId); return <option key={`${url.sourceId}-${url.url}`} value={index}>{source?.version_kind ?? source?.host ?? url.sourceId} · {url.url.includes("/api/pdf/") ? "proxy" : "direct"}</option>; })}</select></label>
      <button onClick={() => setPageNumber((page) => Math.max(1, page - 1))}>Previous page</button>
      <span>Page {pageNumber}</span>
      <button onClick={() => setPageNumber((page) => page + 1)}>Next page</button>
      <button onClick={() => setScale((value) => Math.max(0.5, value - 0.1))}>−</button>
      <button onClick={() => setScale((value) => Math.min(3, value + 0.1))}>+</button>
      {inZotero ? <span>In Zotero</span> : onAddToZotero && <button onClick={onAddToZotero}>Add to Zotero</button>}
      {onState && <><button onClick={() => onState({ type: "start_reading" })}>Start reading</button><button onClick={() => onState({ type: "mark_read" })}>Mark read</button></>}
    </header>
    {failed && <p role="alert">No public PDF source could be loaded. Try an external copy: {sources.map((source) => <a key={source.id} href={source.landing_url ?? source.pdf_url} target="_blank" rel="noreferrer">{source.host ?? source.id}</a>)}</p>}
    <div ref={scrollContainer} onScroll={(event) => current && onProgress?.({ sourceId: current.sourceId, pageNumber, zoom: scale, scrollOffset: event.currentTarget.scrollTop })} onMouseUp={handleSelection} style={{ overflow: "auto", maxHeight: "80vh" }}>
      <div style={{ position: "relative", width: "max-content" }}>
        <PdfDocument url={current.url} gatewayUrl={gatewayUrl} pageNumber={pageNumber} scale={scale} onError={advanceSource} onPageSize={() => undefined} onTextLayer={setTextLayer} />
        <HighlightLayer rects={[...highlights.filter((highlight) => highlight.source_id === current.sourceId && highlight.page_number === pageNumber).flatMap((highlight) => highlight.rects), ...rects]} />
      </div>
    </div>
  </main>;
}
