# Setup

## Prerequisites

For local development, install Node.js 24+, enable Corepack, Python 3.11+, and
`uv`. Docker and the Supabase CLI are required only for the local database
policy tests; the web, Worker, and recommender unit tests do not need Supabase
credentials.

## Install and local checks

```sh
corepack enable
corepack pnpm install
corepack pnpm test
corepack pnpm lint
corepack pnpm build
corepack pnpm test:e2e
```

`test:e2e` starts Vite on `127.0.0.1:4173`, so run it from a normal local
terminal that is allowed to bind a local port. The database policy tests are
separate:

```sh
supabase start
supabase test db
```

## Runtime services

1. Create a Supabase project and copy its project URL, anon key, and project ref.
2. Link and migrate the project:

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   ```

3. Create `apps/web/.env.local`:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   VITE_GATEWAY_URL=https://<worker-subdomain>.<account>.workers.dev
   VITE_ALLOWED_EMAIL=you@example.com
   ```

   `VITE_ALLOWED_EMAIL` is optional. Never put service-role, GitHub, or Zotero
   credentials in this file.

4. Enable Google OAuth in Supabase Authentication → Providers → Google. Copy
   the callback URL shown by Supabase into the Google OAuth client, and add
   `http://localhost:5173` plus the deployed web URL to Supabase redirect URLs.
5. Deploy the Worker and set its secrets (below). Keep Zotero and GitHub
   credentials server-side.
6. Configure the GitHub Actions secrets (below) and enable the
   `recommender.yml` workflow.

GitHub Actions needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENALEX_API_KEY` (optional), `OPENALEX_MAILTO`, `SEMANTIC_SCHOLAR_API_KEY` (optional), `UNPAYWALL_EMAIL`, `ZOTERO_API_KEY`, and `ZOTERO_USER_ID`. The Worker needs the browser-safe Supabase URL/anon key plus GitHub and Zotero secrets listed in the workflow configuration. Never put service-role, Zotero, or GitHub values in `VITE_*` variables.

Web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GATEWAY_URL`, optional `VITE_ALLOWED_EMAIL`.

Worker: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `ALLOWED_EMAIL`, `ZOTERO_API_KEY`, `ZOTERO_USER_ID`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_WORKFLOW`, optional `GITHUB_REF`.

Deploy the Worker from the repository root:

```sh
npx wrangler login
npx wrangler deploy --config workers/gateway/wrangler.toml
for name in SUPABASE_URL SUPABASE_ANON_KEY ZOTERO_API_KEY ZOTERO_USER_ID GITHUB_TOKEN GITHUB_OWNER GITHUB_REPO GITHUB_WORKFLOW; do
  npx wrangler secret put "$name" --config workers/gateway/wrangler.toml
done
```

If you want the convenience guard, also run `npx wrangler secret put
ALLOWED_EMAIL --config workers/gateway/wrangler.toml`. Set `GITHUB_WORKFLOW` to
`recommender.yml`; set `GITHUB_REF` to the workflow branch if it is not `main`.
The fine-grained GitHub token only needs permission to dispatch Actions in this
repository.

The app is online-only in v1. It stores metadata, state, highlights, embeddings, and notebook JSON; it never stores PDF binaries.

The database policy tests require Docker and the Supabase CLI. `supabase start` applies the migrations locally, and `supabase test db` runs the pgTAP suite in `supabase/tests`.

## Google OAuth

In Supabase Authentication → Providers → Google, add the OAuth client ID/secret and set the Supabase callback URL in Google Cloud. Add the deployed web origin to Supabase redirect URLs. Set `VITE_ALLOWED_EMAIL` only as a convenience guard; RLS remains the security boundary.

## Deployment

Build the web app with `npm run build` and deploy `apps/web/dist` to Cloudflare Pages (or any static HTTPS host). Deploy the Worker from `workers/gateway` with Wrangler; configure its non-secret variables in `wrangler.toml` and secrets with `wrangler secret put`. Keep `VITE_*` values limited to the Supabase URL, anon key, gateway URL, and optional email guard.

Typical commands are `npx wrangler pages deploy apps/web/dist` for Pages and
`npx wrangler deploy --config workers/gateway/wrangler.toml` for the gateway.

Create a private GitHub repository, add the recommender workflow, and configure the Actions secrets listed below. The scheduled workflow exits before discovery unless Stable Mode is enabled. Quota exhaustion is handled as a failed/degraded run; there is no paid fallback.

## First smoke test

Start the web app with `corepack pnpm --filter @paper-radar/web dev`, sign in
with Google, then verify this order: create a feed with a description, classify
a Today paper as Maybe, start reading it, mark it read, confirm it appears in
Library, reject another paper, and undo the rejection. After the Worker and
GitHub secrets are configured, use Training → Fetch 25 more and manually
dispatch `recommender.yml` with `mode=training`. Stable Mode must be enabled
explicitly before scheduled jobs discover anything.

## Zotero

Create a personal Zotero API key with library read/write metadata permissions, then store it only as `ZOTERO_API_KEY` in the Worker and GitHub Actions. `ZOTERO_USER_ID` is the numeric user/library ID. The integration transfers metadata only—never PDFs, highlights, or notebook data.
