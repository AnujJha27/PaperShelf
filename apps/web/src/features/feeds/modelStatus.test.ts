import { describe, expect, it } from "vitest";
import { summarizeFeedModel } from "./modelStatus";

describe("feed model status", () => {
  it("reports cold start, training, and ready states from labels and model metrics", () => {
    expect(summarizeFeedModel("feed", [], null).status).toBe("Cold start");
    expect(summarizeFeedModel("feed", [{ label: "relevant" }, { label: "not_relevant" }], null)).toMatchObject({ status: "Training", total: 2, relevant: 1, notRelevant: 1 });
    expect(summarizeFeedModel("feed", [], { metrics: { balanced_accuracy: 0.8 } })).toMatchObject({ status: "Ready", balancedAccuracy: 0.8 });
  });

  it("removes a rejected label after undo and uses the latest label", () => {
    expect(summarizeFeedModel("feed", [
      { paper_id: "paper", label: "not_relevant", created_at: "2026-01-01" },
      { paper_id: "paper", event_type: "undo_rejection", created_at: "2026-01-02" },
      { paper_id: "paper", label: "relevant", created_at: "2026-01-03" },
    ], null)).toMatchObject({ total: 1, relevant: 1, notRelevant: 0 });
  });
});
