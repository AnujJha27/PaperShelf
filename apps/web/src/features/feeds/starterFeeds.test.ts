import { describe, expect, it } from "vitest";
import { starterFeeds, uncreatedStarterFeeds } from "./starterFeeds";

describe("starter feeds", () => {
  it("provides frontier ML templates and skips existing names", () => {
    expect(starterFeeds).toHaveLength(11);
    expect(starterFeeds.some((feed) => feed.name === "Frontier ML & LLMs")).toBe(true);
    expect(starterFeeds.some((feed) => feed.name === "Mathematics, Probability & Statistics")).toBe(true);
    expect(starterFeeds.some((feed) => feed.name === "Multi-Agent & Federated Learning")).toBe(true);
    expect(starterFeeds.some((feed) => feed.name === "Machine Learning for Finance")).toBe(true);
    expect(uncreatedStarterFeeds([{ name: "frontier ml & llms" }])).not.toContainEqual(
      expect.objectContaining({ name: "Frontier ML & LLMs" }),
    );
  });
});
