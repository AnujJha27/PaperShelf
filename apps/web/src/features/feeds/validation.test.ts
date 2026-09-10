import { describe, expect, it } from "vitest";
import { normalizeKeywords, validateFeedInput } from "./validation";

describe("feed validation", () => {
  it("requires a name and description", () => {
    expect(validateFeedInput({ name: " ", description: " " })).toEqual({
      name: "Name is required",
      description: "Description is required",
    });
  });

  it("normalizes and deduplicates keyword controls", () => {
    expect(normalizeKeywords(" Lean, theorem proving\nlean ")).toEqual([
      "lean",
      "theorem proving",
    ]);
  });
});
