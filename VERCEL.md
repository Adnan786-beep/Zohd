# Deploying ZOHD to Vercel

The storefront can be served as static files, while the API runs as a Vercel Node.js function and stores mutable data in Neon Postgres. JSON files and process memory are not durable on Vercel.

## 1. Connect Neon

1. Deploy the project from a connected Git repository, or run `npx vercel` from this project folder and follow the CLI prompts. This workspace currently has no Git remote configured.
2. Add a Neon Postgres database from the Vercel Marketplace and connect it to the project.
3. Make sure the project has a `DATABASE_URL` environment variable containing the Neon connection string.

The API creates its tables and seeds the initial product catalog from `data/products.json` the first time it connects. `schema.sql` documents the database structure.

## 2. Set environment variables

In the Vercel project settings, configure these for Production (and Preview if needed):

- `DATABASE_URL` — Neon connection string.
- `ADMIN_ID` — a private administrator ID.
- `ADMIN_PASSWORD` — a long, unique password. Do not reuse a storefront/customer password.
- `NODE_ENV` — Vercel sets this automatically; production cookies use `Secure`.

Never commit `.env` or put these values in frontend code.

## 3. Deploy and sign in

Deploy the project, then visit `https://<your-deployment>.vercel.app/admin`. The admin dashboard is served through an authenticated route; API endpoints check the persistent admin session stored in Neon.

## 4. Preserve existing customer accounts and records

The first database connection seeds the product catalog only. If you want to retain existing local customer accounts, orders, and newsletter subscriptions, run the import from your own machine after connecting `DATABASE_URL` to the Neon project:

```powershell
$env:DATABASE_URL = "your Neon connection string"
node scripts/migrate-to-neon.js
```

This sends the local account records (including password hashes), orders, and newsletter subscriber addresses to your Neon database. Review the data and destination before running it. The script is idempotent and skips records already present. It does not print account data.

## Local development

`npm.cmd start` still runs the existing local Node server using local JSON files. To test the Vercel function and rewrites locally, install dependencies and run `npx vercel dev` after linking the project and setting the same environment variables.

For CLI deployment, authenticate first with `npx vercel login`, then run `npx vercel` for a preview deployment or `npx vercel --prod` for production.
