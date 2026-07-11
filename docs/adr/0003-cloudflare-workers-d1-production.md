# ADR 0003: Cloudflare Workers and D1 for production

Status: Accepted

## Decision

Deploy the production application as one Cloudflare Worker serving the Vite static assets and API, with D1 as the production database. Keep the Express and SQLite server for local development.

This supersedes ADR 0002 for production deployment only.

## Consequences

- Production has no long-running server to maintain.
- Schema changes are tracked in `migrations/` and applied with Wrangler before deployment.
- SQLite snapshots are exported explicitly and kept outside the repository because they contain family data.
- `FAMILY_ACCESS_CODE` and `DASHSCOPE_API_KEY` are Cloudflare secrets and are never stored in source control.
- The Worker implementation and D1 migration are covered by local production-path tests.
