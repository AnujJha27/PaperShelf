import { describe, expect, it } from "vitest";
import { feedbackEventForAction } from "./api";

describe("feedback event mapping", () => {
  it("maps reclassification to a valid explicit label event", () => {
    expect(feedbackEventForAction("user", "paper", { type: "reclassify", priority: "relevant" }, "feed")).toEqual({
      user_id: "user", paper_id: "paper", feed_id: "feed", event_type: "relevant", label: "relevant", weight: 1,
    });
  });

  it("records rejection undo without training weight", () => {
    expect(feedbackEventForAction("user", "paper", { type: "undo_rejection" })).toEqual({
      user_id: "user", paper_id: "paper", feed_id: null, event_type: "undo_rejection", label: null, weight: 0,
    });
  });
});
