import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "npm run dev --workspace apps/web -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    env: {
      VITE_SUPABASE_URL: "https://supabase.test",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_GATEWAY_URL: "https://gateway.test",
      VITE_ALLOWED_EMAIL: "researcher@example.test",
    },
  },
});
