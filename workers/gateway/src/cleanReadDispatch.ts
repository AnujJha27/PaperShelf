import { authenticatedUser, type GatewayEnv } from "./auth";
import { isPublicHttps } from "./pdfProxy";

export type CleanReadDispatchEnv = GatewayEnv & {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_REF?: string;
  GITHUB_CLEAN_READ_WORKFLOW?: string;
};

const pipelineVersion = "docling-pymupdf-v1";

export async function dispatchCleanRead(request: Request, env: CleanReadDispatchEnv, fetcher: typeof fetch): Promise<Response> {
  const user = await authenticatedUser(request, env, fetcher);
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: { paperId?: unknown; sourceId?: unknown; reprocess?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(body.paperId) || !isUuid(body.sourceId) || (body.reprocess !== undefined && typeof body.reprocess !== "boolean")) {
    return Response.json({ error: "invalid paper or source" }, { status: 400 });
  }

  const authorization = request.headers.get("Authorization")!;
  const sourceResponse = await fetcher(
    `${env.SUPABASE_URL}/rest/v1/paper_sources?id=eq.${body.sourceId}&paper_id=eq.${body.paperId}&select=id,pdf_url,is_open_access`,
    { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization } },
  );
  if (!sourceResponse.ok) return Response.json({ error: "source unavailable" }, { status: 404 });
  const sources = await sourceResponse.json() as Array<{ id: string; pdf_url?: string | null; is_open_access: boolean }>;
  const source = sources[0];
  if (!source?.is_open_access || !source.pdf_url || !isPublicHttps(source.pdf_url)) {
    return Response.json({ error: "public open-access PDF source required" }, { status: 400 });
  }

  const jobResponse = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/request_clean_read`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ p_paper_id: body.paperId, p_paper_source_id: body.sourceId, p_pipeline_version: pipelineVersion, p_reprocess: body.reprocess === true }),
  });
  if (!jobResponse.ok) return Response.json({ error: "could not request Clean Read" }, { status: 502 });
  const result = await jobResponse.json() as { status: string; job_id: string | null; document_id: string | null; created: boolean };
  if (result.document_id || (!result.created && result.status !== "queued")) return Response.json(result, { status: result.document_id ? 200 : 202 });
  if (!result.job_id) return Response.json({ error: "Clean Read job was not created" }, { status: 502 });

  const dispatchUrl = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/${encodeURIComponent(env.GITHUB_CLEAN_READ_WORKFLOW || "clean-read.yml")}/dispatches`;
  const dispatch = await fetcher(dispatchUrl, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_TOKEN}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "PaperShelf/1.0", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: env.GITHUB_REF || "main", inputs: { job_id: result.job_id } }),
  });
  if (!dispatch.ok) {
    await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/fail_clean_read_dispatch`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ p_job_id: result.job_id }),
    }).catch(() => undefined);
    return Response.json({ error: "extraction workflow could not be started" }, { status: 502 });
  }
  return Response.json(result, { status: 202 });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
