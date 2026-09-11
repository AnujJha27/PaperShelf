import { authenticatedUser, type GatewayEnv } from "./auth";

export type DispatchEnv = GatewayEnv & {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_WORKFLOW: string;
  GITHUB_REF?: string;
};

export async function dispatchTrainingBatch(request: Request, env: DispatchEnv, fetcher: typeof fetch): Promise<Response> {
  let body: { feedId?: string | null; batchSize?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const batchSize = body.batchSize ?? 25;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100 || (body.feedId !== undefined && body.feedId !== null && !isUuid(body.feedId))) {
    return Response.json({ error: "invalid training batch" }, { status: 400 });
  }
  const user = await authenticatedUser(request, env, fetcher);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const requestId = crypto.randomUUID();
  const authorization = request.headers.get("Authorization")!;
  const runResponse = await fetcher(`${env.SUPABASE_URL}/rest/v1/ingestion_runs`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: user.id, request_id: requestId, mode: "training", status: "queued", requested_feed_id: body.feedId ?? null }),
  });
  if (!runResponse.ok) return Response.json({ error: "could not create ingestion run" }, { status: 502 });
  const url = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/${encodeURIComponent(env.GITHUB_WORKFLOW)}/dispatches`;
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: env.GITHUB_REF || "main", inputs: { mode: "training", request_id: requestId, feed_id: body.feedId ?? "", batch_size: String(batchSize) } }),
  });
  if (!response.ok) {
    await markRunFailed(env, authorization, String(user.id), requestId, fetcher);
    return Response.json({ error: "workflow dispatch failed", github_status: response.status }, { status: 502 });
  }
  return Response.json({ requestId, status: "queued" }, { status: 202 });
}

export async function dispatchZoteroSync(request: Request, env: DispatchEnv, fetcher: typeof fetch): Promise<Response> {
  const user = await authenticatedUser(request, env, fetcher);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const requestId = crypto.randomUUID();
  const runResponse = await fetcher(`${env.SUPABASE_URL}/rest/v1/ingestion_runs`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: request.headers.get("Authorization")!, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: user.id, request_id: requestId, mode: "zotero_sync", status: "queued" }),
  });
  if (!runResponse.ok) return Response.json({ error: "could not create ingestion run" }, { status: 502 });
  const response = await fetcher(`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/${encodeURIComponent(env.GITHUB_WORKFLOW)}/dispatches`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_TOKEN}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: env.GITHUB_REF || "main", inputs: { mode: "zotero_sync", request_id: requestId, feed_id: "", batch_size: "0" } }),
  });
  if (!response.ok) {
    await markRunFailed(env, request.headers.get("Authorization")!, String(user.id), requestId, fetcher);
    return Response.json({ error: "workflow dispatch failed" }, { status: 502 });
  }
  return Response.json({ requestId, status: "queued" }, { status: 202 });
}

async function markRunFailed(env: DispatchEnv, authorization: string, userId: string, requestId: string, fetcher: typeof fetch): Promise<void> {
  try {
    await fetcher(`${env.SUPABASE_URL}/rest/v1/ingestion_runs?user_id=eq.${encodeURIComponent(userId)}&request_id=eq.${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed", error: "workflow dispatch failed", finished_at: new Date().toISOString() }),
    });
  } catch {
    // The original dispatch failure remains the response; cleanup is best effort.
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
