import type { Rect } from "./readerModel";

export function selectionRects(range: Range, container: HTMLElement): Rect[] {
  const bounds = container.getBoundingClientRect();
  return [...range.getClientRects()].map((rect) => ({ x: (rect.left - bounds.left) / bounds.width, y: (rect.top - bounds.top) / bounds.height, width: rect.width / bounds.width, height: rect.height / bounds.height }));
}

export function HighlightLayer({ rects }: { rects: Rect[] }) {
  return <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    {rects.map((rect, index) => <span key={index} style={{ position: "absolute", left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, background: "#facc15", opacity: 0.35 }} />)}
  </div>;
}
