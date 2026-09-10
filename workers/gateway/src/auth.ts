export type GatewayEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ALLOWED_EMAIL?: string;
};

export function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization");
  return value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

export async function authenticatedUser(request: Request, env: GatewayEnv, fetcher: typeof fetch): Promise<Record<string, unknown> | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const response = await fetcher(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json() as Record<string, unknown>;
  return env.ALLOWED_EMAIL && String(user.email ?? "").toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase() ? null : user;
}
