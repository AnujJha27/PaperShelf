import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, IconButton, Menu, MenuItem, Paper as MuiPaper, Popover, Stack, SvgIcon, TableContainer, TextField, Tooltip, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import katex from "katex";
import "katex/dist/katex.min.css";
import { addPaperFromUrl, lookupPaperIdentifier, requestCleanRead, getCleanReadDocument, getCleanReadJob, getCleanReadState, saveCleanReadHighlight, updatePaperState, type CleanReadBlock, type CleanReadDocument, type CleanReadJob, type CleanReadPackage, type CleanReadReference, type PaperSource, type PdfHighlight } from "../../lib/api";
import type { Paper as ResearchPaper } from "@paper-radar/shared";
import type { NotebookQuote, PaperSourceAnchor } from "../notebook/notebookModel";
import type { ReaderFocus } from "./PaperReader";
import { blockSourceBBox, referenceForAuthorYear, referenceSourceUrl } from "./cleanReadModel";

const activeStatuses = new Set(["queued", "fetching", "parsing", "processing_assets", "validating"]);
type OutlineTab = "sections" | "figures" | "tables" | "references";

export type CleanReadHandle = { open(): Promise<void>; openAnchor(anchor: PaperSourceAnchor): Promise<void>; reprocess(): Promise<void> };
type Props = {
  paperId: string;
  paper: ResearchPaper | null;
  source: PaperSource | null;
  onViewPdf: (focus: ReaderFocus) => void;
  onAddToNotes: (quote: NotebookQuote) => void;
  onHighlightSaved: (highlight: PdfHighlight) => void;
};

export const CleanReadPanel = forwardRef<CleanReadHandle, Props>(function CleanReadPanel({ paperId, paper, source, onViewPdf, onAddToNotes, onHighlightSaved }, ref) {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<CleanReadDocument[]>([]);
  const [job, setJob] = useState<CleanReadJob | null>(null);
  const [documentPackage, setDocumentPackage] = useState<CleanReadPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineTab, setOutlineTab] = useState<OutlineTab>("sections");
  const [search, setSearch] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [selection, setSelection] = useState<{ blockId: string; text: string } | null>(null);
  const [figure, setFigure] = useState<{ block: CleanReadBlock; url: string } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [referenceAnchor, setReferenceAnchor] = useState<HTMLElement | null>(null);
  const [activeReference, setActiveReference] = useState<CleanReadReference | null>(null);
  const [referencePaperId, setReferencePaperId] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState("");
  const [queueSaved, setQueueSaved] = useState(false);
  const pendingOpen = useRef(false);
  const content = useRef<HTMLDivElement>(null);

  const refreshState = useCallback(async (loadDocument = true) => {
    if (!source) { setDocuments([]); setDocumentPackage(null); setJob(null); setLoading(false); return; }
    setLoading(true);
    try {
      const state = await getCleanReadState(paperId, source.id);
      setDocuments(state.documents);
      const currentDocument = state.documents.find((document) => isSameSourceVersion(document, source));
      const activeJob = state.jobs.find((candidate) => activeStatuses.has(candidate.status));
      setJob(activeJob ?? state.jobs[0] ?? null);
      if (loadDocument && currentDocument) setDocumentPackage(await getCleanReadDocument(currentDocument.id));
      else if (loadDocument && !currentDocument) setDocumentPackage(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [paperId, source]);

  useEffect(() => {
    setDocuments([]); setJob(null); setDocumentPackage(null); setError(""); setSearch(""); setSelection(null);
    void refreshState();
  }, [refreshState]);

  const currentDocument = useMemo(() => documents.find((document) => source && isSameSourceVersion(document, source)) ?? null, [documents, source]);
  const previousDocument = useMemo(() => documents[0] && documents[0].id !== currentDocument?.id ? documents[0] : null, [documents, currentDocument]);

  const enqueue = useCallback(async (reprocess = false) => {
    if (!source) { setError("No public PDF source is available for Clean Read."); return; }
    setRequesting(true); setError(""); setSelection(null);
    try {
      const result = await requestCleanRead(paperId, source.id, reprocess);
      if (result.job_id) setJob(await getCleanReadJob(result.job_id));
      await refreshState();
    } catch (caught) {
      setError((caught as Error).message);
      await refreshState(false);
    } finally {
      setRequesting(false);
    }
  }, [paperId, source, refreshState]);

  const open = useCallback(async () => {
    if (loading) { pendingOpen.current = true; return; }
    if (!source) { setError("No public PDF source is available for Clean Read."); return; }
    if (currentDocument) {
      if (documentPackage?.document.id !== currentDocument.id) setDocumentPackage(await getCleanReadDocument(currentDocument.id));
      return;
    }
    if (job && activeStatuses.has(job.status)) return;
    await enqueue(false);
  }, [loading, source, currentDocument, documentPackage, job, enqueue]);

  const reprocess = useCallback(async () => enqueue(true), [enqueue]);
  const openAnchor = useCallback(async (anchor: PaperSourceAnchor) => {
    try {
      const next = await getCleanReadDocument(anchor.documentId);
      setDocumentPackage(next);
      window.setTimeout(() => content.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(anchor.blockId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (caught) { setError((caught as Error).message); }
  }, []);
  useImperativeHandle(ref, () => ({ open, openAnchor, reprocess }), [open, openAnchor, reprocess]);

  useEffect(() => {
    if (!loading && pendingOpen.current) { pendingOpen.current = false; void open(); }
  }, [loading, open]);

  useEffect(() => {
    if (!job || !activeStatuses.has(job.status)) return;
    const timer = window.setInterval(() => {
      void getCleanReadJob(job.id).then(async (next) => {
        setJob(next);
        if (!activeStatuses.has(next.status)) await refreshState();
      }).catch((caught: Error) => setError(caught.message));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, refreshState]);

  const blocks = documentPackage?.blocks.filter((block) => !(block.block_type === "heading" && block.text?.trim() === documentPackage.document.title?.trim())) ?? [];
  const references = documentPackage?.references ?? [];
  const assets = useMemo(() => new Map((documentPackage?.assets ?? []).map((asset) => [asset.id, asset])), [documentPackage?.assets]);
  const referencesByKey = useMemo(() => new Map(references.map((reference) => [reference.reference_key, reference])), [references]);
  const searchMatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    const matched = new Set<string>();
    for (const block of blocks) {
      if (block.render_mode === "original") continue;
      const text = [block.text ?? "", block.source_text ?? "", JSON.stringify(block.structured_data ?? "")].join(" ").toLowerCase();
      if (text.includes(query)) matched.add(block.id);
    }
    for (const reference of references) {
      if (`${reference.title ?? ""} ${reference.raw_text}`.toLowerCase().includes(query) && reference.block_id) matched.add(reference.block_id);
    }
    return [...matched];
  }, [blocks, references, search]);

  useEffect(() => { setActiveMatch(0); }, [search]);
  function scrollToBlock(blockId: string) {
    const block = documentPackage?.blocks.find((item) => item.id === blockId);
    if (!block) return;
    content.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(block.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOutlineOpen(false);
  }
  function searchStep(delta: number) {
    if (!searchMatches.length) return;
    const next = (activeMatch + delta + searchMatches.length) % searchMatches.length;
    setActiveMatch(next);
    scrollToBlock(searchMatches[next]);
  }
  function viewInPdf(block: CleanReadBlock) {
    if (!documentPackage) return;
    const bbox = blockSourceBBox(block, block.asset_id ? assets.get(block.asset_id) : null);
    onViewPdf({ sourceId: documentPackage.document.paper_source_id, pageNumber: block.page_number, bbox });
  }
  function sourceAnchor(block: CleanReadBlock, assetPath?: string): PaperSourceAnchor | null {
    const bbox = blockSourceBBox(block, block.asset_id ? assets.get(block.asset_id) : null);
    if (!documentPackage || !bbox) return null;
    return { paperId, sourceId: documentPackage.document.paper_source_id, sourceHash: documentPackage.document.source_hash, documentId: documentPackage.document.id, blockId: block.id, pageNumber: block.page_number, bbox, startOffset: null, endOffset: null, sourceContext: block.source_text ?? block.text, ...(assetPath ? { assetPath } : {}) };
  }
  function addBlockToNotes(block: CleanReadBlock, selectedText?: string) {
    const assetPath = block.asset_id ? assets.get(block.asset_id)?.storage_path : undefined;
    const anchor = sourceAnchor(block, assetPath);
    if (!anchor) { setError("This block does not have a source location to attach to notes."); return; }
    const selectionText = selectedText?.trim();
    if (selectionText && block.text) {
      const start = block.text.indexOf(selectionText);
      anchor.startOffset = start >= 0 ? start : null;
      anchor.endOffset = start >= 0 ? start + selectionText.length : null;
      anchor.sourceContext = block.text;
    }
    const citation = `${paper?.title ?? "Paper"} · page ${block.page_number} · ${documentPackage!.document.source_hash.slice(0, 12)}`;
    const text = selectionText ? `${selectionText}\n\n${citation}` : [block.text, citation].filter(Boolean).join("\n\n");
    onAddToNotes({ id: crypto.randomUUID(), text, anchor });
    setSelection(null);
  }
  async function saveSelectionHighlight(block: CleanReadBlock, text: string) {
    if (!documentPackage || !source) return;
    try {
      const saved = await saveCleanReadHighlight(paperId, source.id, documentPackage, block, text);
      onHighlightSaved(saved);
      setSelection(null);
    } catch (caught) { setError((caught as Error).message); }
  }
  async function showReference(reference: CleanReadReference, anchor: HTMLElement) {
    setActiveReference(reference); setReferenceAnchor(anchor); setReferencePaperId(null); setReferenceError(""); setQueueSaved(false);
    try {
      if (reference.doi) setReferencePaperId(await lookupPaperIdentifier("doi", reference.doi));
      else if (reference.arxiv_id) setReferencePaperId(await lookupPaperIdentifier("arxiv", reference.arxiv_id));
    } catch (caught) { setReferenceError((caught as Error).message); }
  }
  async function addReferenceToQueue() {
    if (!activeReference) return;
    try {
      const paperId = referencePaperId ?? (referenceSourceUrl(activeReference) ? (await addPaperFromUrl(referenceSourceUrl(activeReference)!, activeReference.title ?? "")).id : null);
      if (!paperId) throw new Error("This reference has no verified DOI or arXiv identifier to add safely.");
      await updatePaperState(paperId, { type: "relevant" });
      setReferencePaperId(paperId);
      setQueueSaved(true);
    }
    catch (caught) { setReferenceError((caught as Error).message); }
  }
  function viewReferenceInPdf(reference: CleanReadReference) {
    const block = reference.block_id ? blocks.find((candidate) => candidate.id === reference.block_id) : null;
    if (block) viewInPdf(block);
    else if (documentPackage) onViewPdf({ sourceId: documentPackage.document.paper_source_id, pageNumber: reference.page_number, bbox: reference.bbox });
    setReferenceAnchor(null);
  }

  const statusLabel = job ? (job.status === "validating" && job.progress.page && job.progress.page_count
    ? `Validating page ${String(job.progress.page)} of ${String(job.progress.page_count)}`
    : ({ queued: "Queued", fetching: "Fetching paper", parsing: "Parsing document", processing_assets: "Processing figures & tables", validating: "Validating", ready: "Ready", ready_with_fallbacks: "Ready with original source blocks", failed: "Processing failed" }[job.status] ?? job.status)) : "";

  if (loading && !documentPackage) return <Box sx={{ minHeight: 320, display: "grid", placeItems: "center" }}><CircularProgress aria-label="Loading Clean Read status" /></Box>;
  if (!source) return <Alert severity="info">Clean Read needs a public open-access PDF source.</Alert>;

  return <Box component="section" sx={{ minWidth: 0 }}>
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
      <Button size="small" variant="outlined" onClick={() => { setOutlineTab("sections"); setOutlineOpen(true); }} disabled={!documentPackage}>Outline</Button>
      <TextField size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this paper" slotProps={{ htmlInput: { "aria-label": "Search Clean Read" }, input: { startAdornment: <SvgIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }}><path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79L20 22l2-2-6.5-6.5zm-5 0A4.5 4.5 0 1 1 10.5 5a4.5 4.5 0 0 1 0 9z" /></SvgIcon> } }} sx={{ minWidth: { xs: "100%", sm: 220 }, flex: 1 }} disabled={!documentPackage} />
      {search.trim() && <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}><Typography variant="caption" color="text.secondary">{searchMatches.length ? `${activeMatch + 1} of ${searchMatches.length}` : "0 results"}</Typography><Button size="small" onClick={() => searchStep(-1)} disabled={!searchMatches.length}>Previous</Button><Button size="small" onClick={() => searchStep(1)} disabled={!searchMatches.length}>Next</Button></Stack>}
      <Tooltip title="Clean Read options"><IconButton aria-label="Clean Read options" onClick={(event) => setMenuAnchor(event.currentTarget)}><SvgIcon><path d="M12 5a1.8 1.8 0 1 0 0 .01M12 12a1.8 1.8 0 1 0 0 .01M12 19a1.8 1.8 0 1 0 0 .01" fill="currentColor" /></SvgIcon></IconButton></Tooltip>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}><MenuItem disabled={!documentPackage || requesting || Boolean(job && activeStatuses.has(job.status))} onClick={() => { setMenuAnchor(null); void reprocess(); }}>Reprocess Clean Read</MenuItem></Menu>
    </Stack>

    {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 1.5 }}>{error}{job?.status === "failed" && <Button size="small" onClick={() => void enqueue(job.reprocess)}>Retry processing</Button>}</Alert>}
    {job && activeStatuses.has(job.status) && <Alert severity="info" sx={{ mb: 1.5, alignItems: "center" }} icon={<CircularProgress size={18} />}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><span>{statusLabel}</span>{typeof job.progress.page_count === "number" && <Typography variant="caption" color="text.secondary">{job.progress.page_count} pages</Typography>}{job.status === "queued" && error && <Button size="small" onClick={() => void enqueue(job.reprocess)}>Retry processing</Button>}</Stack></Alert>}
    {job?.status === "failed" && <Alert severity="warning" sx={{ mb: 1.5 }}>Clean Read could not be processed. The PDF remains available. {job.error}</Alert>}

    {!documentPackage && previousDocument && <Alert severity="info" sx={{ mb: 1.5 }}>
      Clean Read was generated from another version. Process this version.
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button size="small" variant="outlined" onClick={() => void getCleanReadDocument(previousDocument.id).then(setDocumentPackage).catch((caught: Error) => setError(caught.message))}>Open previous version</Button><Button size="small" onClick={() => void enqueue(false)} disabled={requesting}>Process this version</Button></Stack>
    </Alert>}

    {!documentPackage && !previousDocument && !job && <MuiPaper variant="outlined" sx={{ minHeight: 260, p: { xs: 2, sm: 4 }, display: "grid", placeItems: "center", textAlign: "center" }}>
      <Stack spacing={1.5} sx={{ alignItems: "center" }}><Typography variant="h2">Clean Read</Typography><Typography color="text.secondary" sx={{ maxWidth: 460 }}>Build a structured view of this PDF on request. Figures, tables, equations, and source locations stay tied to the original paper.</Typography><Button variant="contained" onClick={() => void enqueue(false)} disabled={requesting}>{requesting ? "Queuing…" : "Generate Clean Read"}</Button></Stack>
    </MuiPaper>}

    {documentPackage && <>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5, flexWrap: "wrap" }}><Chip size="small" variant="outlined" color={documentPackage.document.status === "ready" ? "success" : "default"} label={documentPackage.document.status === "ready" ? "Ready" : "Ready with original blocks"} /><Typography variant="caption" color="text.secondary">Source version · {documentPackage.document.source_hash.slice(0, 12)} · {documentPackage.document.page_count} pages</Typography></Stack>
      <Box ref={content} onMouseUp={(event) => {
        const selected = window.getSelection();
        if (!selected || selected.isCollapsed) { setSelection(null); return; }
        const node = selected.anchorNode instanceof Element ? selected.anchorNode : selected.anchorNode?.parentElement;
        const blockElement = node?.closest<HTMLElement>("[data-block-id]");
        if (!blockElement || !event.currentTarget.contains(blockElement)) { setSelection(null); return; }
        const text = selected.toString().trim();
        setSelection(text ? { blockId: blockElement.dataset.blockId!, text } : null);
      }} sx={{ maxWidth: 820, mx: "auto", color: "text.primary", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: { xs: "1rem", md: "1.05rem" }, lineHeight: 1.78 }}>
        <Typography component="h1" sx={{ fontFamily: "inherit", fontSize: { xs: "1.8rem", md: "2.35rem" }, fontWeight: 700, lineHeight: 1.2, mb: 1 }}>{documentPackage.document.title ?? paper?.title}</Typography>
        {Array.isArray(documentPackage.document.authors) && documentPackage.document.authors.length > 0 && <Typography color="text.secondary" sx={{ fontFamily: "inherit", mb: 3 }}>{authorNames(documentPackage.document.authors)}</Typography>}
        <Stack spacing={2.5}>
          {blocks.map((block) => <BlockView key={block.id} block={block} asset={block.asset_id ? assets.get(block.asset_id) ?? null : null} referencesByKey={referencesByKey} selection={selection} onCitation={showReference} onViewPdf={viewInPdf} onAddToNotes={addBlockToNotes} onHighlight={saveSelectionHighlight} onEnlarge={(url) => setFigure({ block, url })} />)}
        </Stack>
      </Box>
    </>}

    <Drawer anchor="left" open={outlineOpen} onClose={() => setOutlineOpen(false)} slotProps={{ paper: { sx: { width: { xs: "min(88vw, 360px)", sm: 320 }, p: 2 } } }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}><Typography variant="h2">Navigate</Typography><Button size="small" onClick={() => setOutlineOpen(false)}>Close</Button></Stack>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mb: 1.5 }}>{(["sections", "figures", "tables", "references"] as OutlineTab[]).map((tab) => <Button key={tab} size="small" variant={outlineTab === tab ? "contained" : "text"} onClick={() => setOutlineTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</Button>)}</Stack>
      {outlineTab === "sections" && <Stack spacing={0.5}>{documentPackage?.document.outline.map((item) => <Button key={item.block_key} size="small" sx={{ justifyContent: "flex-start", pl: Math.min(4, item.level) }} onClick={() => { const block = blocks.find((candidate) => candidate.block_key === item.block_key); if (block) scrollToBlock(block.id); }}>{item.text}</Button>)}</Stack>}
      {outlineTab === "figures" && <Stack spacing={0.5}>{blocks.filter((block) => block.block_type === "figure").map((block) => <Button key={block.id} size="small" sx={{ justifyContent: "flex-start" }} onClick={() => scrollToBlock(block.id)}>{block.text || "Figure"}</Button>)}</Stack>}
      {outlineTab === "tables" && <Stack spacing={0.5}>{blocks.filter((block) => block.block_type === "table").map((block) => <Button key={block.id} size="small" sx={{ justifyContent: "flex-start" }} onClick={() => scrollToBlock(block.id)}>{block.text || "Table"}</Button>)}</Stack>}
      {outlineTab === "references" && <Stack spacing={0.5}><TextField size="small" placeholder="Search references" slotProps={{ htmlInput: { "aria-label": "Search references" } }} onChange={(event) => setSearch(event.target.value)} />{references.filter((reference) => !search.trim() || `${reference.title ?? ""} ${reference.raw_text}`.toLowerCase().includes(search.trim().toLowerCase())).map((reference) => <Button key={reference.id} size="small" sx={{ justifyContent: "flex-start", textAlign: "left" }} onClick={() => reference.block_id ? scrollToBlock(reference.block_id) : onViewPdf({ sourceId: documentPackage!.document.paper_source_id, pageNumber: reference.page_number, bbox: reference.bbox })}>[{reference.reference_key}] {reference.title ?? reference.raw_text}</Button>)}</Stack>}
    </Drawer>

    <Popover open={Boolean(referenceAnchor && activeReference)} anchorEl={referenceAnchor} onClose={() => setReferenceAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}>
      {activeReference && <Stack spacing={1} sx={{ p: 2, width: { xs: 280, sm: 360 } }}><Typography variant="subtitle1">{activeReference.title ?? activeReference.raw_text}</Typography><Typography variant="body2" color="text.secondary">{[authorNames(activeReference.authors ?? []), activeReference.venue, activeReference.year].filter(Boolean).join(" · ") || "Reference details from the source paper"}</Typography>{activeReference.doi && <Typography variant="caption">DOI: {activeReference.doi}</Typography>}{referencePaperId && <Typography variant="caption" color="success.main">Already in PaperShelf</Typography>}{referenceError && <Typography variant="caption" color="error">{referenceError}</Typography>}<Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>{referencePaperId && <Button size="small" onClick={() => navigate(`/reading/${referencePaperId}`)}>Open in PaperShelf</Button>}{(referencePaperId || referenceSourceUrl(activeReference)) && <Button size="small" onClick={() => void addReferenceToQueue()}>{queueSaved ? "Added to Queue" : "Add to Queue"}</Button>}{referenceSourceUrl(activeReference) && <Button size="small" component="a" href={referenceSourceUrl(activeReference)!} target="_blank" rel="noreferrer">Open source</Button>}<Button size="small" onClick={() => viewReferenceInPdf(activeReference)}>View in PDF</Button></Stack></Stack>}
    </Popover>

    <Dialog open={Boolean(figure)} onClose={() => setFigure(null)} fullWidth maxWidth="lg"><DialogTitle>{figure?.block.text || "Original source crop"}</DialogTitle><DialogContent>{figure && <Box component="img" src={figure.url} alt={figure.block.text || "Original paper figure"} sx={{ display: "block", width: "100%", maxHeight: "72vh", objectFit: "contain" }} />}</DialogContent><DialogActions>{figure && <Button onClick={() => { viewInPdf(figure.block); setFigure(null); }}>View in PDF</Button>}{figure && <Button onClick={() => { addBlockToNotes(figure.block); setFigure(null); }}>Add to notes</Button>}<Button onClick={() => setFigure(null)}>Close</Button></DialogActions></Dialog>
  </Box>;
});

function isSameSourceVersion(document: CleanReadDocument, source: PaperSource): boolean {
  const sameTime = !source.updated_at || new Date(document.source_updated_at).getTime() === new Date(source.updated_at).getTime();
  return document.source_url === source.pdf_url && sameTime;
}

function authorNames(value: unknown[]): string {
  return value.map((author) => typeof author === "string" ? author : author && typeof author === "object" ? String((author as { display_name?: string; name?: string }).display_name ?? (author as { name?: string }).name ?? "") : "").filter(Boolean).join(", ");
}

function parseCitationKeys(value: string): string[] {
  const keys: string[] = [];
  for (const part of value.split(/\s*,\s*/)) {
    const range = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (range) {
      const first = Number(range[1]); const last = Number(range[2]);
      if (last >= first && last - first <= 20) for (let key = first; key <= last; key += 1) keys.push(String(key));
    } else if (/^\d+$/.test(part.trim())) keys.push(part.trim());
  }
  return keys;
}

function BlockView({ block, asset, referencesByKey, selection, onCitation, onViewPdf, onAddToNotes, onHighlight, onEnlarge }: {
  block: CleanReadBlock;
  asset: CleanReadPackage["assets"][number] | null;
  referencesByKey: Map<string, CleanReadReference>;
  selection: { blockId: string; text: string } | null;
  onCitation: (reference: CleanReadReference, anchor: HTMLElement) => void;
  onViewPdf: (block: CleanReadBlock) => void;
  onAddToNotes: (block: CleanReadBlock, text?: string) => void;
  onHighlight: (block: CleanReadBlock, text: string) => void;
  onEnlarge: (url: string) => void;
}) {
  const selected = selection?.blockId === block.id ? selection.text : "";
  const [mathHtml, mathError] = useMemo(() => {
    if (block.block_type !== "equation" || block.render_mode === "original" || !block.structured_data?.latex) return [null, false] as const;
    try { return [katex.renderToString(block.structured_data.latex, { displayMode: true, throwOnError: true, strict: "error", trust: false }), false] as const; }
    catch { return [null, true] as const; }
  }, [block]);
  const useOriginal = block.render_mode === "original" || mathError;
  const renderCrop = asset?.signed_url && (block.block_type === "figure" || useOriginal || block.block_type === "table" && !block.structured_data?.rows);
  const assetUrl = asset?.signed_url ?? null;
  const ref = assetUrl ? asset : null;
  const caption = block.block_type === "figure" || block.block_type === "table" ? asset?.caption ?? block.text : null;
  const title = block.block_type === "figure" ? "Figure" : block.block_type === "table" ? "Table" : block.block_type === "equation" ? "Equation" : "Source block";
  const table = block.structured_data?.rows;

  return <Box id={`clean-${block.id}`} data-block-id={block.id} component="section" sx={{ scrollMarginTop: 16, py: block.block_type === "heading" ? 0.6 : 0 }}>
    {block.block_type === "heading" && !useOriginal ? <Typography component={block.reading_order < 3 ? "h2" : "h3"} sx={{ fontFamily: "inherit", fontSize: block.reading_order < 3 ? "1.6rem" : "1.28rem", fontWeight: 700, lineHeight: 1.35, mt: 2.5 }}>{block.text}</Typography> : <>
      {block.block_type === "equation" && !useOriginal && mathHtml && <Box sx={{ overflowX: "auto", py: 2, textAlign: "center", "& .katex-display": { margin: 0 } }}><div dangerouslySetInnerHTML={{ __html: mathHtml }} /></Box>}
      {renderCrop && ref && <Box component="figure" sx={{ m: 0, my: 1.5 }}><Box component="button" onClick={() => onEnlarge(assetUrl!)} aria-label={`Enlarge ${title.toLowerCase()}`} sx={{ display: "block", p: 0, width: "100%", border: 0, background: "transparent", cursor: "zoom-in" }}><Box component="img" src={assetUrl ?? undefined} alt={caption || `${title} from the original paper`} sx={{ display: "block", width: "100%", maxHeight: 560, objectFit: "contain" }} /></Box>{useOriginal && <Typography component="span" variant="caption" color="text.secondary" sx={{ fontFamily: "sans-serif", fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>Original</Typography>}{caption && <Typography component="figcaption" variant="body2" sx={{ fontFamily: "inherit", mt: 0.75, color: "text.secondary" }}>{caption}</Typography>}</Box>}
      {block.block_type === "table" && table && !useOriginal && <TableContainer sx={{ maxWidth: "100%", overflowX: "auto", my: 1.5 }}><table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "inherit", fontSize: "0.9em" }}><tbody>{table.map((row, rowIndex) => <tr key={`${block.id}-r${rowIndex}`}>{row.map((cell, colIndex) => { const Tag = cell.header || cell.row_header ? "th" : "td"; return <Tag key={`${block.id}-${rowIndex}-${colIndex}`} scope={cell.header ? "col" : cell.row_header ? "row" : undefined} rowSpan={cell.rowspan ?? 1} colSpan={cell.colspan ?? 1} style={{ border: "1px solid rgba(128,128,128,.35)", padding: "7px 9px", textAlign: cell.header ? "center" : "left", verticalAlign: "top" }}>{cell.text}</Tag>; })}</tr>)}</tbody></table></TableContainer>}
      {block.block_type !== "figure" && block.block_type !== "table" && block.block_type !== "equation" && block.block_type !== "heading" && block.text && !useOriginal && <Typography component={block.block_type === "list" ? "div" : "p"} sx={{ fontFamily: "inherit", lineHeight: "inherit", whiteSpace: "pre-wrap", m: 0 }}><CitationText text={block.text} referencesByKey={referencesByKey} onCitation={onCitation} /></Typography>}
      {block.block_type === "table" && !table && !renderCrop && block.text && <Typography component="p" sx={{ fontFamily: "inherit", m: 0 }}>{block.text}</Typography>}
      {block.block_type === "figure" && block.text && !renderCrop && <Typography component="p" sx={{ fontFamily: "inherit", m: 0 }}>{block.text}</Typography>}
      {block.block_type === "table" && table && !useOriginal && block.text && <Typography component="p" sx={{ fontFamily: "inherit", fontWeight: 600, mb: 0.75 }}>{block.text}</Typography>}
      {(block.block_type === "figure" || block.block_type === "table" || block.block_type === "equation") && ref && !useOriginal && <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}><Button size="small" onClick={() => onEnlarge(assetUrl!)}>{block.block_type === "table" || block.block_type === "equation" ? "View original" : "Enlarge"}</Button>{block.block_type === "table" && <Button size="small" onClick={() => void navigator.clipboard.writeText((table ?? []).map((row) => row.map((cell) => cell.text).join("\t")).join("\n"))}>Copy table</Button>}{block.block_type === "table" && <Button size="small" onClick={() => void navigator.clipboard.writeText((table ?? []).map((row) => row.map((cell) => `"${cell.text.replaceAll('"', '""')}"`).join(",")).join("\n"))}>Copy CSV</Button>}</Stack>}
      {block.block_type !== "heading" && <Stack direction="row" spacing={0.5} useFlexGap sx={{ mt: 0.4, flexWrap: "wrap" }}><Button size="small" onClick={() => onViewPdf(block)}>View in PDF · p. {block.page_number}</Button><Button size="small" onClick={() => onAddToNotes(block)}>Add to notes</Button>{selected && <><Button size="small" onClick={() => onAddToNotes(block, selected)}>Add selection to notes</Button><Button size="small" onClick={() => onHighlight(block, selected)}>Highlight selection</Button></>}</Stack>}
      {useOriginal && !renderCrop && block.block_type !== "figure" && block.block_type !== "table" && ref && <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>Original</Typography>}
    </>}
    <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5, fontFamily: "sans-serif", fontSize: 10 }}>Page {block.page_number}{block.section_path?.length ? ` · ${block.section_path.at(-1)}` : ""}</Typography>
  </Box>;
}

function CitationText({ text, referencesByKey, onCitation }: { text: string; referencesByKey: Map<string, CleanReadReference>; onCitation: (reference: CleanReadReference, anchor: HTMLElement) => void }) {
  const citationPattern = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\(([\p{L}][\p{L}'’-]*(?:\s+et\s+al\.?)?,\s*(?:19|20)\d{2})\)/giu;
  const fragments: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(citationPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) fragments.push(text.slice(cursor, index));
    const keys = match[1] ? parseCitationKeys(match[1]) : [];
    const items = match[1] ? keys.map((key) => referencesByKey.get(key)) : [referenceForAuthorYear(match[0], [...referencesByKey.values()]) ?? undefined];
    if (!items.length || items.some((item) => !item)) fragments.push(match[0]);
    else if (items.length === 1) fragments.push(<Button key={`${index}-${match[0]}`} size="small" variant="text" sx={{ minWidth: 0, p: 0, verticalAlign: "baseline", fontFamily: "inherit", fontSize: "inherit", textTransform: "none" }} onClick={(event) => onCitation(items[0]!, event.currentTarget)}>{match[0]}</Button>);
    else fragments.push(<span key={`${index}-${match[0]}`}>[{items.map((item, itemIndex) => <span key={item!.id}><Button size="small" variant="text" sx={{ minWidth: 0, p: 0, verticalAlign: "baseline", fontFamily: "inherit", fontSize: "inherit", textTransform: "none" }} onClick={(event) => onCitation(item!, event.currentTarget)}>{keys[itemIndex]}</Button>{itemIndex < items.length - 1 ? ", " : ""}</span>)}]</span>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) fragments.push(text.slice(cursor));
  return <>{fragments}</>;
}
