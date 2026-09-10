import { proxyPdf } from "./pdfProxy";
import { dispatchTrainingBatch, dispatchZoteroSync } from "./githubDispatch";
import { addToZotero } from "./zotero";

export function healthResponse(): { status: "ok" } {
  return { status: "ok" };
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Range, If-None-Match, If-Modified-Since",
    "Access-Control-Expose-Headers": "Content-Type, Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified",
    "Access-Control-Max-Age": "86400",
  });
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      const allowed = parsed.origin === "http://localhost:5173" ||
        parsed.hostname === "paper-radar-web.pages.dev" ||
        parsed.hostname.endsWith(".paper-radar-web.pages.dev");
      if (allowed) {
        headers.set("Access-Control-Allow-Origin", parsed.origin);
        headers.set("Vary", "Origin");
      }
    } catch {
      // Ignore malformed Origin headers.
    }
  }
  return headers;
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; ALLOWED_EMAIL?: string; GITHUB_TOKEN: string; GITHUB_OWNER: string; GITHUB_REPO: string; GITHUB_WORKFLOW: string; GITHUB_REF?: string; ZOTERO_API_KEY: string; ZOTERO_USER_ID: string }): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });

    const url = new URL(request.url);
    let response: Response;
    if (request.method === "GET" && url.pathname === "/health") {
      response = Response.json(healthResponse());
    } else if (request.method === "POST" && url.pathname === "/api/jobs/training-batch") {
      response = await dispatchTrainingBatch(request, env, fetch);
    } else if (request.method === "POST" && url.pathname === "/api/zotero/sync") {
      response = await dispatchZoteroSync(request, env, fetch);
    } else if (request.method === "POST" && url.pathname === "/api/zotero/add") {
      response = await addToZotero(request, env, fetch);
    } else {
      const match = url.pathname.match(/^\/api\/pdf\/([^/]+)$/);
      if (request.method === "GET" && match) response = await proxyPdf(request, match[1], env, fetch);
      else response = new Response("Not found", { status: 404 });
    }

    return withCors(request, response);
  },
};
