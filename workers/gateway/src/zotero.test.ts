import { describe, expect, it } from "vitest";
import { addToZotero, type ZoteroEnv } from "./zotero";

const env: ZoteroEnv = { SUPABASE_URL: "https://supabase.example", SUPABASE_ANON_KEY: "anon", ZOTERO_API_KEY: "zotero", ZOTERO_USER_ID: "123" };

describe("Zotero bridge", () => {
  it("requires the caller session", async () => {
    const response = await addToZotero(new Request("https://gateway.test", { method: "POST", body: JSON.stringify({ paperId: "paper" }) }), env, fetch);
    expect(response.status).toBe(401);
  });

  it("writes metadata only and returns the Zotero key", async () => {
    const calls: Request[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(String(input), init); calls.push(request);
      if (request.url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      if (request.url.includes("/rest/v1/papers")) return Response.json([{ title: "Paper", abstract: "Abstract", doi: "10.1000/test", authors: [{ name: "A" }], venue: "Journal", publication_date: "2024-01-01", canonical_url: "https://paper.test" }]);
      if (request.url.includes("/rest/v1/zotero_items")) return Response.json([]);
      return Response.json({ successful: { "0": { key: "ABC123" } } });
    };
    const response = await addToZotero(new Request("https://gateway.test", { method: "POST", headers: { Authorization: "Bearer token" }, body: JSON.stringify({ paperId: "paper" }) }), env, fetcher);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "created-or-existing", zoteroKey: "ABC123" });
    expect(await calls.at(-1)?.text()).not.toContain("pdf");
  });
});
