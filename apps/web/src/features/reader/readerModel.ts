export type Rect = { x: number; y: number; width: number; height: number };
export type ReaderSource = { id: string; pdf_url: string; landing_url?: string | null; host?: string | null; version_kind?: string | null };
export type PdfDocumentRequest = string | { url: string; httpHeaders: { Authorization: string } };

export function normalizeRects(rects: Rect[], pageWidth: number, pageHeight: number): Rect[] {
  if (pageWidth <= 0 || pageHeight <= 0) throw new Error("page dimensions must be positive");
  return rects.map((rect) => ({ x: rect.x / pageWidth, y: rect.y / pageHeight, width: rect.width / pageWidth, height: rect.height / pageHeight }));
}

export function readerSources(sources: ReaderSource[], gatewayUrl: string): Array<{ sourceId: string; url: string }> {
  return sources.flatMap((source) => [
    { sourceId: source.id, url: source.pdf_url },
    { sourceId: source.id, url: `${gatewayUrl.replace(/\/$/, "")}/api/pdf/${encodeURIComponent(source.id)}` },
  ]);
}

export function pdfDocumentRequest(url: string, token: string | null, gatewayUrl = ""): PdfDocumentRequest {
  const base = "https://paper-radar.invalid";
  const target = new URL(url, base);
  const gateway = new URL(gatewayUrl || "/api/pdf/", base);
  const isProxy = target.origin === gateway.origin && target.pathname.startsWith("/api/pdf/");
  return token && isProxy ? { url, httpHeaders: { Authorization: `Bearer ${token}` } } : url;
}
