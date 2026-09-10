import { authenticatedUser, type GatewayEnv } from "./auth";

export type ZoteroEnv = GatewayEnv & { ZOTERO_API_KEY: string; ZOTERO_USER_ID: string };

export async function addToZotero(request: Request, env: ZoteroEnv, fetcher: typeof fetch): Promise<Response> {
  let body: { paperId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.paperId) return Response.json({ error: "paperId is required" }, { status: 400 });
  const user = await authenticatedUser(request, env, fetcher);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const authorization = request.headers.get("Authorization")!;
  const restHeaders = { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization };
  const paperResponse = await fetcher(`${env.SUPABASE_URL}/rest/v1/papers?id=eq.${encodeURIComponent(body.paperId)}&select=title,abstract,doi,authors,venue,publication_date,canonical_url`, { headers: restHeaders });
  const paper = (await paperResponse.json() as Array<Record<string, unknown>>)[0];
  if (!paper) return new Response("Paper not found", { status: 404 });
  const existingResponse = await fetcher(`${env.SUPABASE_URL}/rest/v1/zotero_items?paper_id=eq.${encodeURIComponent(body.paperId)}&select=zotero_key`, { headers: restHeaders });
  const existing = (await existingResponse.json() as Array<{ zotero_key?: string }>)[0];
  if (existing?.zotero_key) return Response.json({ status: "created-or-existing", zoteroKey: existing.zotero_key }, { status: 200 });

  const zoteroResponse = await fetcher(`https://api.zotero.org/users/${encodeURIComponent(env.ZOTERO_USER_ID)}/items`, {
    method: "POST",
    headers: { "Zotero-API-Key": env.ZOTERO_API_KEY, "Zotero-API-Version": "3", "Content-Type": "application/json" },
    body: JSON.stringify([metadataItem(paper)]),
  });
  if (!zoteroResponse.ok) return Response.json({ error: "Zotero create failed" }, { status: 502 });
  const result = await zoteroResponse.json() as { successful?: Record<string, { key?: string }> };
  const zoteroKey = result.successful?.["0"]?.key;
  if (!zoteroKey) return Response.json({ error: "Zotero returned no item key" }, { status: 502 });
  await fetcher(`${env.SUPABASE_URL}/rest/v1/zotero_items`, { method: "POST", headers: { ...restHeaders, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ user_id: user.id, zotero_key: zoteroKey, paper_id: body.paperId, doi: paper.doi, title: paper.title, metadata: paper }) });
  return Response.json({ status: "created-or-existing", zoteroKey }, { status: 201 });
}

function metadataItem(paper: Record<string, unknown>) {
  return {
    itemType: "journalArticle",
    title: paper.title,
    abstractNote: paper.abstract ?? "",
    DOI: paper.doi ?? "",
    publicationTitle: paper.venue ?? "",
    date: paper.publication_date ?? "",
    url: paper.canonical_url ?? "",
    creators: Array.isArray(paper.authors) ? paper.authors.map((author) => ({ creatorType: "author", name: typeof author === "string" ? author : (author as { name?: string; display_name?: string }).name ?? (author as { display_name?: string }).display_name ?? "" })) : [],
    tags: [],
  };
}
