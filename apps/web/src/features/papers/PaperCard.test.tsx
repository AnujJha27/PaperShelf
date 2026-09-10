import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PaperCard } from "./PaperCard";

describe("paper card", () => {
  it("shows the abstract, feed, score details, and classification actions", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PaperCard paper={{ id: "p", title: "Paper", abstract: "Full abstract", authors: ["A"], venue: "Journal", publication_year: 2026, canonical_url: null }} feedLabel="Methods" score={0.8} components={{ semantic_similarity: 0.3 }} onAction={vi.fn()} /></MemoryRouter>);
    expect(html).toContain("Full abstract");
    expect(html).toContain("Feeds: Methods");
    expect(html).toContain("Recommendation score");
    expect(html).toContain("Relevant");
    expect(html).toContain('href="/reading/p"');
  });

  it("marks papers already linked to Zotero", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PaperCard paper={{ id: "p", title: "Paper", abstract: null, authors: [], venue: null, publication_year: null, canonical_url: null, in_zotero: true }} onAction={vi.fn()} onAddToZotero={vi.fn()} /></MemoryRouter>);
    expect(html).toContain("In Zotero");
    expect(html).not.toContain("Add to Zotero");
  });

  it("shows all feed badges for a canonical paper", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PaperCard paper={{ id: "p", title: "Paper", abstract: null, authors: [], venue: null, publication_year: null, canonical_url: null }} feedLabels={["Methods", "Formal ML"]} onAction={vi.fn()} /></MemoryRouter>);
    expect(html).toContain("Feeds: Methods, Formal ML");
  });
});
