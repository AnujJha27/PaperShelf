import { describe, expect, it } from "vitest";
import { proxyPdf, type GatewayEnv } from "./pdfProxy";

const env: GatewayEnv = { SUPABASE_URL: "https://supabase.example", SUPABASE_ANON_KEY: "anon" };

describe("PDF gateway", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await proxyPdf(new Request("https://gateway.test/api/pdf/source"), "source", env, fetch);
    expect(response.status).toBe(401);
  });

  it("rejects a stored source that is not public OA", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      return Response.json([{ pdf_url: "https://paid.example/paper.pdf", is_open_access: false }]);
    };
    const response = await proxyPdf(new Request("https://gateway.test/api/pdf/source", { headers: { Authorization: "Bearer token" } }), "source", env, fetcher);
    expect(response.status).toBe(404);
  });

  it("rejects loopback PDF origins even when marked OA", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      if (url.includes("/rest/v1/paper_sources")) return Response.json([{ pdf_url: "https://127.0.0.1/paper.pdf", is_open_access: true }]);
      throw new Error("third-party fetch should not happen");
    };
    const response = await proxyPdf(new Request("https://gateway.test/api/pdf/source", { headers: { Authorization: "Bearer token" } }), "source", env, fetcher);
    expect(response.status).toBe(404);
  });

  it("rejects IPv6 loopback PDF origins even when marked OA", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user" });
      if (url.includes("/rest/v1/paper_sources")) return Response.json([{ pdf_url: "https://[::1]/paper.pdf", is_open_access: true }]);
      throw new Error("third-party fetch should not happen");
    };
    const response = await proxyPdf(new Request("https://gateway.test/api/pdf/source", { headers: { Authorization: "Bearer token" } }), "source", env, fetcher);
    expect(response.status).toBe(404);
  });
});
