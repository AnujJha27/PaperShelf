import { describe, expect, it } from "vitest";
import { normalizePaperUrl } from "./manualPaper";

describe("manual paper URLs", () => {
  it("trims and normalizes HTTPS paper links", () => {
    expect(normalizePaperUrl("  https://arxiv.org/abs/1706.03762  ")).toBe("https://arxiv.org/abs/1706.03762");
  });

  it("rejects non-HTTPS links", () => {
    expect(() => normalizePaperUrl("http://example.com/paper")).toThrow("HTTPS");
  });
});
