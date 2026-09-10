import { describe, expect, it } from "vitest";
import worker, { healthResponse } from "./index";

describe("gateway health", () => {
  it("returns a healthy response", () => {
    expect(healthResponse()).toEqual({ status: "ok" });
  });
});

describe("browser access", () => {
  it("answers the training request preflight with CORS headers", async () => {
    const response = await worker.fetch(new Request("https://gateway.test/api/jobs/training-batch", {
      method: "OPTIONS",
      headers: {
        Origin: "https://paper-radar-web.pages.dev",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    }), {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_ANON_KEY: "anon",
      GITHUB_TOKEN: "token",
      GITHUB_OWNER: "owner",
      GITHUB_REPO: "repo",
      GITHUB_WORKFLOW: "recommender.yml",
      ZOTERO_API_KEY: "zotero",
      ZOTERO_USER_ID: "123",
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://paper-radar-web.pages.dev");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
