import { describe, expect, it } from "vitest";
import { darkTokens, feedPalette, lightTokens } from "./tokens";

describe("application theme tokens", () => {
  it("keeps dark and light surfaces distinct", () => {
    expect(darkTokens.background).toBe("#111614");
    expect(lightTokens.background).toBe("#F4F6F2");
    expect(darkTokens.background).not.toBe(lightTokens.background);
  });

  it("provides a small stable feed palette", () => {
    expect(feedPalette.length).toBeGreaterThanOrEqual(6);
    expect(new Set(feedPalette).size).toBe(feedPalette.length);
  });
});
