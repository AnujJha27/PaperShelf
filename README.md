# Personal Research Radar

Single-user paper discovery and reading workspace. The product plan is in
[`personal_research_radar_luna_handoff.md`](personal_research_radar_luna_handoff.md).

Prerequisites: Node.js 24+ with Corepack, Python 3.11+ with `uv`; Docker and
the Supabase CLI are additionally needed for the local database policy tests.

## Local checks

```sh
corepack pnpm install
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
supabase start
supabase test db
```
