import { describe, expect, it } from "vitest";
import { trainingRefreshInterval } from "./trainingPolling";

describe("training refresh", () => {
  it("polls while a batch is pending and stays idle otherwise", () => {
    expect(trainingRefreshInterval(true)).toBe(5_000);
    expect(trainingRefreshInterval(false)).toBe(false);
  });
});
