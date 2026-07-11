# Cloudflare deployment

Production runs as one Cloudflare Worker with Static Assets and a D1 database.
Login attempts are limited by the `LOGIN_RATE_LIMITER` binding in `wrangler.jsonc`.

## Production resources

- Worker: `happy-eat`
- URL: `https://happy-eat.shaw-family.workers.dev`
- D1 database: `happy-eat`
- D1 region: APAC

## Required secrets

Set secrets interactively. Do not put their values in `wrangler.jsonc` or commit them.

```powershell
npx wrangler secret put FAMILY_ACCESS_CODE
npx wrangler secret put DASHSCOPE_API_KEY
```

`DASHSCOPE_API_KEY` is optional when AI extraction is not required.

## Deploy

```powershell
npm install
npm run d1:migrate
npm run deploy
```

`npm run deploy` builds the Vite client and deploys the Worker and static assets. D1 migrations are applied separately so database changes stay explicit.

## Local Worker runtime

Create an ignored `.dev.vars` file containing local secret values, then run:

```powershell
npm run d1:migrate:local
npm run dev:worker
```

The existing `npm run dev` command continues to run the Express and SQLite development server on port 5173.

## Data migration

Apply the baseline migration before importing data. The initial production database followed this same order, so `d1_migrations` is already established for future migrations.

```powershell
npm run d1:migrate
npx wrangler d1 execute happy-eat --remote --command "SELECT name FROM d1_migrations ORDER BY id"
```

Generate a snapshot from a consistent SQLite read transaction, keeping the SQL file outside the repository:

```powershell
npm run d1:export -- data/happy-eat.sqlite "$env:TEMP\happy-eat-d1-import.sql"
npx wrangler d1 execute happy-eat --remote --file "$env:TEMP\happy-eat-d1-import.sql"
```

Verify the imported row counts:

```powershell
npx wrangler d1 execute happy-eat --remote --command "SELECT 'ingredients' AS table_name, COUNT(*) AS row_count FROM ingredients UNION ALL SELECT 'recipes', COUNT(*) FROM recipes UNION ALL SELECT 'recipe_ingredients', COUNT(*) FROM recipe_ingredients UNION ALL SELECT 'recipe_steps', COUNT(*) FROM recipe_steps"
```

Keep exports outside the repository because they contain family data.
