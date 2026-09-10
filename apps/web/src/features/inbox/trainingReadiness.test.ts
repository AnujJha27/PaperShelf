import { describe, expect, it } from "vitest";
import { summarizeTrainingLabels, trainingReady } from "./trainingReadiness";

describe("training readiness", () => {
  it("counts explicit labels only while keeping Maybe as a weak positive", () => {
    const summary = summarizeTrainingLabels([
      { label: "relevant", feed_id: "a" },
      { label: "maybe", feed_id: "a" },
      { label: "not_relevant", feed_id: "b" },
      { event_type: "start_reading", feed_id: "b" },
      { event_type: "mark_read", feed_id: "b" },
    ]);
    expect(summary).toEqual({ total: 3, relevant: 1, maybe: 1, positive: 2, negative: 1, feedCoverage: 2 });
    expect(trainingReady({ ...summary, total: 60, relevant: 15, negative: 15 }, 0.6)).toBe(true);
  });

  it("uses the latest explicit state when a rejection is reversed", () => {
    const summary = summarizeTrainingLabels([
      { paper_id: "paper", label: "not_relevant", created_at: "2026-01-01" },
      { paper_id: "paper", event_type: "undo_rejection", created_at: "2026-01-02" },
      { paper_id: "paper", label: "maybe", created_at: "2026-01-03" },
    ]);
    expect(summary).toMatchObject({ total: 1, relevant: 0, maybe: 1, negative: 0 });
  });
});
