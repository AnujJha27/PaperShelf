import { useEffect, useRef, useState } from "react";
import { CircularProgress } from "@mui/material";
import type { PDFDocumentProxy, RenderTask, TextLayer as PdfTextLayer } from "pdfjs-dist";
import { supabase } from "../../lib/supabase";
import { clampPage, outputScaleForDpr, pdfDocumentRequest, type PdfErrorKind } from "./readerModel";

export function PdfDocument({ url, gatewayUrl, pageNumber, scale, onError, onNumPages, onPageSize, onTextLayer }: { url: string; gatewayUrl: string; pageNumber: number; scale: number; onError: (kind: PdfErrorKind) => void; onNumPages: (numPages: number) => void; onPageSize: (size: { width: number; height: number }) => void; onTextLayer: (element: HTMLElement) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [busy, setBusy] = useState(true);
  const callbacks = useRef({ onError, onNumPages, onPageSize, onTextLayer });
  callbacks.current = { onError, onNumPages, onPageSize, onTextLayer };

  useEffect(() => {
    let cancelled = false;
    let loading: { destroy: () => Promise<void> } | undefined;
    setDocument(undefined);
    setBusy(true);
    void (async () => {
      try {
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
        if (cancelled) return;
        const task = getDocument(pdfDocumentRequest(url, token, gatewayUrl));
        loading = task;
        const pdf = await task.promise;
        if (cancelled) return;
        callbacks.current.onNumPages(pdf.numPages);
        setDocument(pdf);
      } catch {
        if (!cancelled) { setBusy(false); callbacks.current.onError("document"); }
      }
    })();
    return () => { cancelled = true; void loading?.destroy().catch(() => undefined); };
  }, [url, gatewayUrl]);

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    let layer: PdfTextLayer | undefined;
    setBusy(true);
    void (async () => {
      try {
        // Bounds are page state, never a document/source failure.
        const page = await document.getPage(clampPage(pageNumber, document.numPages));
        if (cancelled) return;
        const natural = page.getViewport({ scale: 1 });
        callbacks.current.onPageSize({ width: natural.width, height: natural.height });
        const viewport = page.getViewport({ scale });
        const outputScale = outputScaleForDpr(window.devicePixelRatio, viewport.width, viewport.height);
        // Render offscreen so transitions retain the previous page until ready.
        const nextCanvas = window.document.createElement("canvas");
        nextCanvas.width = Math.floor(viewport.width * outputScale);
        nextCanvas.height = Math.floor(viewport.height * outputScale);
        render = page.render({ canvasContext: nextCanvas.getContext("2d")!, canvas: nextCanvas, viewport, transform: [outputScale, 0, 0, outputScale, 0, 0] });
        await render.promise;
        if (cancelled) return;
        const nextText = window.document.createElement("div");
        nextText.className = "textLayer";
        nextText.style.setProperty("--total-scale-factor", String(scale));
        const { TextLayer } = await import("pdfjs-dist");
        const textContent = await page.getTextContent();
        if (cancelled) return;
        layer = new TextLayer({ textContentSource: textContent, container: nextText, viewport });
        await layer.render();
        if (cancelled || !canvas.current || !textLayer.current) return;
        const target = canvas.current;
        target.width = nextCanvas.width;
        target.height = nextCanvas.height;
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        target.getContext("2d")!.drawImage(nextCanvas, 0, 0);
        const textTarget = textLayer.current;
        textTarget.style.width = `${viewport.width}px`;
        textTarget.style.height = `${viewport.height}px`;
        textTarget.style.setProperty("--total-scale-factor", String(scale));
        textTarget.style.setProperty("--min-font-size", nextText.style.getPropertyValue("--min-font-size"));
        textTarget.replaceChildren(...nextText.childNodes);
        callbacks.current.onTextLayer(textTarget);
        setBusy(false);
      } catch {
        if (!cancelled) { setBusy(false); callbacks.current.onError("render"); }
      }
    })();
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); };
  }, [document, pageNumber, scale]);

  return <div aria-busy={busy} style={{ position: "relative", width: "max-content", minWidth: 48, minHeight: 48 }}>
    <canvas ref={canvas} style={{ display: "block" }} />
    <div ref={textLayer} className="textLayer" style={{ position: "absolute", inset: 0, pointerEvents: busy ? "none" : undefined }} />
    {busy && <div role="status" aria-label="Loading PDF page" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(127,127,127,0.08)", zIndex: 2 }}><CircularProgress size={28} /></div>}
  </div>;
}
