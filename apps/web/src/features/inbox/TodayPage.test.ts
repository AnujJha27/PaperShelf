import { describe, expect, it } from "vitest";
import { dedupeRecommendations } from "./TodayPage";

const paper = { id: "paper", title: "Paper", abstract: null, authors: [], venue: null, publication_year: null, canonical_url: null };

describe("Today recommendations", () => {
  it("deduplicates a canonical paper while retaining every feed label", () => {
    const result = dedupeRecommendations([
      { id: "a", paper_id: "paper", feed_id: "one", final_score: 0.4, reason_text: "one", components: {}, created_at: "", paper, feed: { id: "one", name: "Methods" } },
      { id: "b", paper_id: "paper", feed_id: "two", final_score: 0.9, reason_text: "two", components: {}, created_at: "", paper, feed: { id: "two", name: "Formal ML" } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].final_score).toBe(0.9);
    expect(result[0].feedLabels).toEqual(["Methods", "Formal ML"]);
  });
});
