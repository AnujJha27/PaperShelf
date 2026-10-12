import { describe, expect, it } from "vitest";
import { dispatchCleanRead, type CleanReadDispatchEnv } from "./cleanReadDispatch";

const env: CleanReadDispatchEnv = {
  SUPABASE_URL: "https://supabase.example", SUPABASE_ANON_KEY: "anon", GITHUB_TOKEN: "secret",
  GITHUB_OWNER: "owner", GITHUB_REPO: "repo", GITHUB_REF: "main",
};
const paperId = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";

function request(body: unknown) {
  return new Request("https://gateway.test/api/clean-read", { method: "POST", headers: { Authorization: "Bearer user-token", "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("Clean Read dispatch", () => {
  it("authenticates, validates the exact public source, and dispatches the job", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input); calls.push({ url, init });
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      if (url.includes("/rest/v1/paper_sources")) return Response.json([{ id: sourceId, pdf_url: "https://arxiv.org/pdf/1234.5678.pdf", is_open_access: true }]);
      if (url.endsWith("/rpc/request_clean_read")) return Response.json({ job_id: "job", status: "queued", created: true, document_id: null });
      if (url.includes("/actions/workflows/clean-read.yml/dispatches")) return new Response(null, { status: 204 });
      throw new Error(`unexpected ${url}`);
    };
    const response = await dispatchCleanRead(request({ paperId, sourceId }), env, fetcher);
    expect(response.status).toBe(202);
    expect(calls.some(({ url }) => url.includes(`id=eq.${sourceId}&paper_id=eq.${paperId}`))).toBe(true);
    expect(JSON.parse(String(calls.at(-1)?.init?.body))).toEqual({ ref: "main", inputs: { job_id: "job" } });
    expect(String(calls.at(-1)?.init?.headers)).not.toContain("user-token");
  });

  it("does not dispatch a job already active or an existing extraction", async () => {
    let dispatched = false;
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      if (url.includes("/rest/v1/paper_sources")) return Response.json([{ pdf_url: "https://arxiv.org/pdf/1234.5678.pdf", is_open_access: true }]);
      if (url.endsWith("/rpc/request_clean_read")) return Response.json({ status: "ready", document_id: "doc", job_id: null, created: false });
      if (url.includes("/actions/workflows/")) dispatched = true;
      return new Response(null, { status: 204 });
    };
    const response = await dispatchCleanRead(request({ paperId, sourceId }), env, fetcher);
    expect(response.status).toBe(200);
    expect(dispatched).toBe(false);
  });

  it("re-dispatches a queued idempotent job when a prior dispatch response was lost", async () => {
    let dispatches = 0;
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      if (url.includes("/rest/v1/paper_sources")) return Response.json([{ pdf_url: "https://arxiv.org/pdf/1234.5678.pdf", is_open_access: true }]);
      if (url.endsWith("/rpc/request_clean_read")) return Response.json({ status: "queued", document_id: null, job_id: "same-job", created: false });
      if (url.includes("/actions/workflows/")) { dispatches += 1; return new Response(null, { status: 204 }); }
      throw new Error(`unexpected ${url}`);
    };
    const response = await dispatchCleanRead(request({ paperId, sourceId }), env, fetcher);
    expect(response.status).toBe(202);
    expect(dispatches).toBe(1);
  });

  it("requires authentication and rejects untrusted PDF URLs", async () => {
    const unauthorized = await dispatchCleanRead(request({ paperId, sourceId }), env, async () => new Response(null, { status: 401 }));
    expect(unauthorized.status).toBe(401);
    const fetcher: typeof fetch = async (input) => String(input).endsWith("/auth/v1/user")
      ? Response.json({ id: "user" })
      : Response.json([{ pdf_url: "https://127.0.0.1/secret.pdf", is_open_access: true }]);
    const response = await dispatchCleanRead(request({ paperId, sourceId }), env, fetcher);
    expect(response.status).toBe(400);
  });

  it("marks a newly created job failed if GitHub rejects dispatch", async () => {
    let failedJob = false;
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      if (url.includes("/rest/v1/paper_sources")) return Response.json([{ pdf_url: "https://arxiv.org/pdf/1234.5678.pdf", is_open_access: true }]);
      if (url.endsWith("/rpc/request_clean_read")) return Response.json({ status: "queued", job_id: "job", document_id: null, created: true });
      if (url.includes("/actions/workflows/")) return new Response(null, { status: 403 });
      if (url.endsWith("/rpc/fail_clean_read_dispatch")) failedJob = true;
      return new Response(null, { status: 204 });
    };
    const response = await dispatchCleanRead(request({ paperId, sourceId }), env, fetcher);
    expect(response.status).toBe(502);
    expect(failedJob).toBe(true);
  });
});
