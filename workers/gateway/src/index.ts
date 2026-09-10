import { proxyPdf } from "./pdfProxy";
import { dispatchTrainingBatch, dispatchZoteroSync } from "./githubDispatch";
import { addToZotero } from "./zotero";

export function healthResponse(): { status: "ok" } {
  return { status: "ok" };
}

export default {
  async fetch(request: Request, env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; ALLOWED_EMAIL?: string; GITHUB_TOKEN: string; GITHUB_OWNER: string; GITHUB_REPO: string; GITHUB_WORKFLOW: string; GITHUB_REF?: string; ZOTERO_API_KEY: string; ZOTERO_USER_ID: string }): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(healthResponse());
    }
    if (request.method === "POST" && url.pathname === "/api/jobs/training-batch") return dispatchTrainingBatch(request, env, fetch);
    if (request.method === "POST" && url.pathname === "/api/zotero/sync") return dispatchZoteroSync(request, env, fetch);
    if (request.method === "POST" && url.pathname === "/api/zotero/add") return addToZotero(request, env, fetch);
    const match = url.pathname.match(/^\/api\/pdf\/([^/]+)$/);
    if (request.method === "GET" && match) return proxyPdf(request, match[1], env, fetch);

    return new Response("Not found", { status: 404 });
  },
};
