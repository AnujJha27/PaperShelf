import { describe, expect, it } from "vitest";
import { transitionPaperState } from "./workflow";

describe("paper lifecycle", () => {
  it("moves classifications to their durable destinations", () => {
    expect(transitionPaperState({ status: "inbox" }, { type: "relevant" })).toEqual({ status: "queue", queue_priority: "relevant" });
    expect(transitionPaperState({ status: "inbox" }, { type: "maybe" })).toEqual({ status: "queue", queue_priority: "maybe" });
    expect(transitionPaperState({ status: "inbox" }, { type: "not_relevant" })).toEqual({ status: "rejected" });
  });

  it("moves reading papers to library only when marked read", () => {
    expect(transitionPaperState({ status: "queue", queue_priority: "relevant" }, { type: "start_reading" })).toEqual({ status: "reading", queue_priority: null });
    expect(transitionPaperState({ status: "inbox" }, { type: "start_reading" })).toEqual({ status: "reading", queue_priority: null });
    expect(transitionPaperState({ status: "reading" }, { type: "mark_read" })).toEqual({ status: "read", queue_priority: null });
  });

  it("recovers rejected papers into the inbox or queue", () => {
    expect(transitionPaperState({ status: "rejected" }, { type: "undo_rejection" })).toEqual({ status: "inbox" });
    expect(transitionPaperState({ status: "rejected" }, { type: "reclassify", priority: "maybe" })).toEqual({ status: "queue", queue_priority: "maybe" });
  });
});
