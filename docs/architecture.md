# Architecture

The web app is a React/Vite PWA. Supabase provides Google OAuth, Postgres, pgvector, and RLS. The Cloudflare Worker is the authenticated boundary for public PDF streaming, GitHub Actions dispatch, and Zotero metadata writes. The Python service owns discovery, identity, ranking, model training, and scheduled orchestration.

The browser never receives service-role, Zotero, or GitHub credentials. PDF access is restricted to source rows marked open access with HTTPS URLs; the Worker forwards only byte-range/cache headers and never forwards third-party cookies.

Paper state is canonical per user/paper. Feeds are many-to-many through `paper_feed_links`; rejecting a paper hides it from discovery while retaining its feedback and recovery history. Notebook pages use normalized JSON coordinates and optimistic versions instead of CRDT/OT because v1 is single-user and online-only.
