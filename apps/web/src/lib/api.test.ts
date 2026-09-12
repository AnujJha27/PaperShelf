import { describe, expect, it } from "vitest";
import { transitionPaperState } from "@paper-radar/shared";

describe("paper transitions", () => {
  it("keeps client action semantics aligned with the transactional RPC", () => {
    expect(transitionPaperState({ status: "rejected" }, { type: "reclassify", priority: "relevant" })).toEqual({ status: "queue", queue_priority: "relevant" });
  });
});
