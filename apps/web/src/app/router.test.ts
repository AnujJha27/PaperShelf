import { describe, expect, it } from "vitest";
import { routePaths } from "./router";

describe("protected app routes", () => {
  it("exposes the product navigation", () => {
    expect(routePaths).toEqual([
      "/",
      "/feeds",
      "/queue",
      "/reading",
      "/library",
      "/history/rejected",
      "/training",
      "/settings",
    ]);
  });
});
