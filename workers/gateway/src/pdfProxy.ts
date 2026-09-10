import { authenticatedUser, type GatewayEnv } from "./auth";

export type { GatewayEnv };

const responseHeaders = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

export async function proxyPdf(request: Request, sourceId: string, env: GatewayEnv, fetcher: typeof fetch): Promise<Response> {
  if (!await authenticatedUser(request, env, fetcher)) return new Response("Unauthorized", { status: 401 });

  const auth = request.headers.get("Authorization")!;
  const sourceUrl = `${env.SUPABASE_URL}/rest/v1/paper_sources?id=eq.${encodeURIComponent(sourceId)}&select=pdf_url,is_open_access`;
  const sourceResponse = await fetcher(sourceUrl, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth } });
  if (!sourceResponse.ok) return new Response("Source unavailable", { status: 404 });
  const sources = await sourceResponse.json() as Array<{ pdf_url?: string; is_open_access?: boolean }>;
  const source = sources[0];
  if (!source?.is_open_access || !source.pdf_url || !isPublicHttps(source.pdf_url)) return new Response("Source unavailable", { status: 404 });

  const headers = new Headers();
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetcher(source.pdf_url, { headers });
  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) return new Response("PDF unavailable", { status: 502 });
  const output = new Headers();
  for (const name of responseHeaders) {
    const value = upstream.headers.get(name);
    if (value) output.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: output });
}

function isPublicHttps(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isPrivateIpv4 = (host: string) => /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    const privateHost = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "::1" || isPrivateIpv4(hostname) || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:") || (hostname.startsWith("::ffff:") && isPrivateIpv4(hostname.slice(7)));
    return url.protocol === "https:" && Boolean(hostname) && !url.username && !url.password && !privateHost;
  } catch {
    return false;
  }
}
