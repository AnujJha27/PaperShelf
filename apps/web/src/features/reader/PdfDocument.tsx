import { useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { pdfDocumentRequest, type PdfErrorKind } from "./readerModel";

export function PdfDocument({ url, gatewayUrl, pageNumber, scale, onError, onNumPages, onPageSize, onTextLayer }: { url: string; gatewayUrl: string; pageNumber: number; scale: number; onError: (kind: PdfErrorKind) => void; onNumPages: (numPages: number) => void; onPageSize: (size: { width: number; height: number }) => void; onTextLayer: (element: HTMLElement) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let loading: { destroy: () => void } | undefined;
    void import("pdfjs-dist").then(async ({ getDocument, GlobalWorkerOptions }) => {
      GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
      const task = getDocument(pdfDocumentRequest(url, token, gatewayUrl));
      loading = task;
      return task.promise;
    }).then(async (pdf) => {
      if (cancelled) return;
      onNumPages(pdf.numPages);
      if (pageNumber < 1 || pageNumber > pdf.numPages) {
        onError("page");
        return;
      }
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
      const target = canvas.current;
      const textTarget = textLayer.current;
      if (!target || !textTarget) return;
      target.width = viewport.width;
      target.height = viewport.height;
      target.style.width = `${viewport.width}px`;
      target.style.height = `${viewport.height}px`;
      textTarget.replaceChildren();
      textTarget.style.width = `${viewport.width}px`;
      textTarget.style.height = `${viewport.height}px`;
      onPageSize({ width: viewport.width, height: viewport.height });
      await page.render({ canvasContext: target.getContext("2d")!, canvas: target, viewport }).promise;
      const { TextLayer } = await import("pdfjs-dist");
      const layer = new TextLayer({ textContentSource: await page.getTextContent(), container: textTarget, viewport });
      await layer.render();
      onTextLayer(textTarget);
      } catch {
        if (!cancelled) onError("render");
      }
    }).catch(() => { if (!cancelled) onError("document"); });
    return () => { cancelled = true; loading?.destroy(); };
  }, [url, gatewayUrl, pageNumber, scale, onError, onPageSize, onTextLayer]);

  return <div style={{ position: "relative", width: "max-content" }}>
    <canvas ref={canvas} />
    <div ref={textLayer} className="textLayer" style={{ position: "absolute", inset: 0 }} />
  </div>;
}
