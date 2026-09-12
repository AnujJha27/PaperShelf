import { describe, expect, it } from "vitest";
import { clampPage, normalizeRects, pdfDocumentRequest, readerSources } from "./readerModel";

describe("reader model", () => {
  it("stores highlight rectangles in page-normalized coordinates", () => {
    expect(normalizeRects([{ x: 10, y: 20, width: 30, height: 40 }], 100, 200)).toEqual([{ x: 0.1, y: 0.1, width: 0.3, height: 0.2 }]);
  });

  it("tries direct URLs before the authenticated proxy and preserves source order", () => {
    expect(readerSources([{ id: "a", pdf_url: "https://a.test/a.pdf" }, { id: "b", pdf_url: "https://b.test/b.pdf" }], "https://gateway.test")).toEqual([
      { sourceId: "a", url: "https://a.test/a.pdf" },
      { sourceId: "a", url: "https://gateway.test/api/pdf/a" },
      { sourceId: "b", url: "https://b.test/b.pdf" },
      { sourceId: "b", url: "https://gateway.test/api/pdf/b" },
    ]);
  });

  it("adds auth only to the Worker proxy request", () => {
    expect(pdfDocumentRequest("https://gateway.test/api/pdf/source", "token", "https://gateway.test")).toEqual({ url: "https://gateway.test/api/pdf/source", httpHeaders: { Authorization: "Bearer token" } });
    expect(pdfDocumentRequest("https://publisher.test/api/pdf/source", "token", "https://gateway.test")).toBe("https://publisher.test/api/pdf/source");
  });

  it("clamps restored page numbers to the document bounds", () => {
    expect(clampPage(0, 18)).toBe(1);
    expect(clampPage(4, 18)).toBe(4);
    expect(clampPage(99, 18)).toBe(18);
  });
});
