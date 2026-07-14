# Unleashed → QuickBooks Online Revenue Splitter

A simple Next.js app to read **Sales Invoices only** from Unleashed and create matching invoices in QuickBooks Online with revenue split by Unleashed Product Group → QuickBooks income account mapping.

## What this app does

- Stores Unleashed API credentials securely in Supabase.
- Connects QuickBooks Online using OAuth 2.0.
- Pulls Unleashed Product Groups.
- Pulls QuickBooks Chart of Accounts.
- Lets user map each Unleashed Product Group to a QuickBooks income account.
- Reads Unleashed Sales Invoices.
- Creates QuickBooks Sales Invoices line by line.
- Tracks synced invoices to avoid duplicates.

## Important scope

This app only handles **Sales Invoices**.
Keep the native Unleashed → QuickBooks integration active for other transactions if required, but disable Sales Invoice export/sync in native integration to avoid duplicates.

## Tech stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres
- QuickBooks Online OAuth 2.0
- Unleashed API HMAC authentication

## Setup summary

1. Create Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL editor.
3. Create Intuit Developer app.
4. Set QuickBooks redirect URI:
   `https://YOUR-VERCEL-DOMAIN.com/api/qbo/callback`
5. Add environment variables in Vercel.
6. Deploy to Vercel.
7. Open app and configure.

## Environment variables

Copy `.env.example` to `.env.local` for local testing, or add these to Vercel.

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_BASE_URL=https://your-vercel-domain.vercel.app
APP_CRON_SECRET=change-this-long-random-value
QBO_ENVIRONMENT=sandbox
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
```

For production QuickBooks, set:

```bash
QBO_ENVIRONMENT=production
```

## Local install

```bash
npm install
npm run dev
```

## Manual actions in the app

1. Go to `/settings` and enter Unleashed API ID + API Key.
2. Click **Connect QuickBooks**.
3. Go to `/mapping`.
4. Click **Refresh Product Groups**.
5. Click **Refresh QBO Accounts**.
6. Map every Unleashed product group to a QuickBooks income account.
7. Go to `/sync` and click **Sync Invoices Now**.

## Cron endpoint

After testing, run sync automatically using cron-job.org or Vercel cron:

```text
POST https://YOUR-VERCEL-DOMAIN.com/api/sync/run
Header: x-cron-secret: YOUR_APP_CRON_SECRET
```

## Notes

- This is a quick working MVP structure.
- Customer matching is by customer name first. If missing, the app creates a QBO customer.
- Product lines are posted using a generic QBO service/non-inventory item per mapped income account.
- Tax handling is included as a simple default mode. You may need to adjust tax code mapping for each country/company.
