import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { PaperAction } from "@paper-radar/shared";
import { addToZotero, deleteHighlight, getPaper, getReaderState, listHighlights, listPaperSources, saveHighlight, saveReaderState, updatePaperState, type PaperSource, type PdfHighlight, type ReaderState } from "../../lib/api";
import type { Paper } from "@paper-radar/shared";
import { PaperReader } from "./PaperReader";
import { Notebook } from "../notebook/Notebook";

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
  return <main><h1>Paper reader</h1><p role="status">{message}</p>{!sources.length && paperUrl && <p>No public PDF is available. <a href={paperUrl} target="_blank" rel="noreferrer">Open the paper externally</a>.</p>}<button onClick={() => setNotebookVisible((visible) => !visible)}>{notebookVisible ? "Hide notebook" : "Show notebook"}</button>{notebookVisible && <label>Notebook width <input aria-label="Notebook width" type="range" min="25" max="60" value={notebookWidth} onChange={(event) => setNotebookWidth(Number(event.target.value))} /> {notebookWidth}%</label>}<div className="reader-split" style={{ gridTemplateColumns: notebookVisible ? `minmax(0, 1fr) minmax(280px, ${notebookWidth}%)` : "1fr" }}><PaperReader sources={sources} gatewayUrl={import.meta.env.VITE_GATEWAY_URL as string | undefined ?? ""} highlights={highlights} initialSourceId={readerState?.source_id} initialPage={readerState?.page_number} initialScale={readerState?.zoom} initialScroll={readerState?.scroll_offset} inZotero={paper?.in_zotero} onHighlight={onHighlight} onProgress={onProgress} onState={onState} onAddToZotero={() => void addToZotero(paperId).then(() => setPaper((current) => current ? { ...current, in_zotero: true } : current)).catch((error: Error) => setMessage(error.message))} />{notebookVisible && <Notebook paperId={paperId} />}</div><aside><h2>Highlights</h2>{highlights.map((highlight) => <p key={highlight.id}>{highlight.selected_text} <button onClick={() => void removeHighlight(highlight.id)}>Delete</button></p>)}</aside></main>;
}
