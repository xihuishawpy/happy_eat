## Agent skills

### Issue tracker

Tasks and PRDs use local Markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context project. Read the root `CONTEXT.md` and relevant ADRs under `docs/adr/`. See `docs/agents/domain.md`.

## Development & maintenance rules

### Feature & regression checklist

- Whenever adding, removing, or changing user-facing features, interactive flows, matching/parsing logic, or API behavior (`src/*.js|jsx`, `server/`, `netlify/functions/`, `worker/`, `cloudbase/functions/`, `migrations/`), update the affected module section(s) in `docs/feature-test-checklist.md` in the same change.
- Keep `docs/feature-test-checklist.md` concise and aligned with actual UI behavior, routes, and status codes.
- Pure styling tweaks (`src/styles.css`) or behavior-preserving refactors do not require checklist edits; if the git hook triggers on a behavior-preserving refactor, bypass with `SKIP_CHECKLIST=1 git commit ...` and note why.

### Verification & multi-backend parity

- Before committing, run `npm test && npm run build`. When changing UI or interactive flows, also run `RUN_PLAYWRIGHT_UI=1 npm test`.
- Keep API endpoints and business rules aligned across `server/index.js`, `netlify/functions/api.mjs`, `worker/index.js`, and `cloudbase/functions/happy-eat-api/index.js`.
- Local git hook `.githooks/pre-commit` enforces checklist updates on core functional commits (enabled via `git config core.hooksPath .githooks`, also run automatically by `npm run prepare`).
