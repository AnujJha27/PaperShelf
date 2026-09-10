import { describe, expect, it } from "vitest";
import { healthResponse } from "./index";

describe("gateway health", () => {
  it("returns a healthy response", () => {
    expect(healthResponse()).toEqual({ status: "ok" });
  });
});
