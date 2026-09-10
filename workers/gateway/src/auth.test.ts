import { describe, expect, it } from "vitest";
import { authenticatedUser, type GatewayEnv } from "./auth";

const env: GatewayEnv = { SUPABASE_URL: "https://supabase.example", SUPABASE_ANON_KEY: "anon", ALLOWED_EMAIL: "allowed@example.test" };

describe("gateway identity guard", () => {
  it("rejects an authenticated user outside the optional allowlist", async () => {
    const user = await authenticatedUser(new Request("https://gateway.test", { headers: { Authorization: "Bearer token" } }), env, async () => Response.json({ id: "user", email: "other@example.test" }));
    expect(user).toBeNull();
  });
});
