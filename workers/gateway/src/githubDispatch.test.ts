import { describe, expect, it } from "vitest";
import { dispatchTrainingBatch, type DispatchEnv } from "./githubDispatch";

const env: DispatchEnv = {
  SUPABASE_URL: "https://supabase.example",
  SUPABASE_ANON_KEY: "anon",
  GITHUB_TOKEN: "token",
  GITHUB_OWNER: "owner",
  GITHUB_REPO: "repo",
  GITHUB_WORKFLOW: "recommender.yml",
  GITHUB_REF: "master",
};

describe("training batch dispatch", () => {
  it("rejects invalid batch sizes", async () => {
    const response = await dispatchTrainingBatch(new Request("https://gateway.test", { method: "POST", body: JSON.stringify({ batchSize: 0 }) }), env, fetch);
    expect(response.status).toBe(400);
  });

  it("dispatches a validated workflow with the requested inputs", async () => {
    let request: Request | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      request = new Request(String(input), init);
      if (String(input).endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      return new Response(null, { status: 204 });
    };
    const response = await dispatchTrainingBatch(new Request("https://gateway.test", { method: "POST", headers: { Authorization: "Bearer token" }, body: JSON.stringify({ feedId: null, batchSize: 25 }) }), env, fetcher);
    expect(response.status).toBe(202);
    expect(request?.url).toContain("/actions/workflows/recommender.yml/dispatches");
  });

  it("dispatches from the configured repository ref", async () => {
    let body = "";
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(String(input), init);
      if (request.url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      if (request.url.includes("/actions/")) body = await request.text();
      return new Response(null, { status: 204 });
    };
    await dispatchTrainingBatch(new Request("https://gateway.test", { method: "POST", headers: { Authorization: "Bearer token" }, body: JSON.stringify({ batchSize: 25 }) }), env, fetcher);
    expect(JSON.parse(body).ref).toBe("master");
  });

  it("marks the queued run failed when GitHub rejects the dispatch", async () => {
    const calls: Request[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(String(input), init);
      calls.push(request);
      if (request.url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      if (request.url.includes("/actions/")) return new Response(null, { status: 500 });
      return new Response(null, { status: 204 });
    };
    const response = await dispatchTrainingBatch(new Request("https://gateway.test", { method: "POST", headers: { Authorization: "Bearer token" }, body: JSON.stringify({ batchSize: 25 }) }), env, fetcher);
    expect(response.status).toBe(502);
    expect(calls.some((request) => request.method === "PATCH" && request.url.includes("ingestion_runs"))).toBe(true);
  });
});
