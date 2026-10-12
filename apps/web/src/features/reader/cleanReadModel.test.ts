import { describe, expect, it } from "vitest";
import { blockSourceBBox, referenceForAuthorYear, referenceSourceUrl } from "./cleanReadModel";

describe("Clean Read references", () => {
  it("links an author-year citation only when one source reference matches", () => {
    const references = [
      { reference_key: "12", year: 2025, raw_text: "[12] Smith, J. A formal account of agents. 2025." },
      { reference_key: "13", year: 2024, raw_text: "[13] Smith, R. A different result. 2024." },
    ];
    expect(referenceForAuthorYear("(Smith et al., 2025)", references)?.reference_key).toBe("12");
    expect(referenceForAuthorYear("(Smith et al., 2024)", references)?.reference_key).toBe("13");
    expect(referenceForAuthorYear("(Jones et al., 2025)", references)).toBeNull();
  });

  it("leaves ambiguous author-year citations unmapped", () => {
    const references = [
      { reference_key: "12", year: 2025, raw_text: "[12] Smith, J. A formal account. 2025." },
      { reference_key: "18", year: 2025, raw_text: "[18] Smith, R. Another account. 2025." },
    ];
    expect(referenceForAuthorYear("(Smith et al., 2025)", references)).toBeNull();
  });

  it("builds queue URLs only from validated DOI or arXiv identifiers", () => {
    expect(referenceSourceUrl({ doi: "10.1234/example.5", arxiv_id: null })).toBe("https://doi.org/10.1234/example.5");
    expect(referenceSourceUrl({ doi: null, arxiv_id: "2401.01234v2" })).toBe("https://arxiv.org/abs/2401.01234v2");
    expect(referenceSourceUrl({ doi: null, arxiv_id: null })).toBeNull();
    expect(referenceSourceUrl({ doi: "javascript:alert(1)", arxiv_id: null })).toBeNull();
  });

  it("uses the source crop geometry when a block bbox failed validation", () => {
    const crop = { x: 0, y: 0, width: 612, height: 792, page_width: 612, page_height: 792 };
    expect(blockSourceBBox({ bbox: null }, { bbox: crop })).toBe(crop);
    const block = { x: 50, y: 60, width: 100, height: 30, page_width: 612, page_height: 792 };
    expect(blockSourceBBox({ bbox: block }, { bbox: crop })).toBe(block);
  });
});
