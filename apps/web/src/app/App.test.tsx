import { describe, expect, it } from "vitest";
import { appName } from "./App";

describe("web app shell", () => {
  it("identifies the product", () => {
    expect(appName).toBe("Personal Research Radar");
  });
});
