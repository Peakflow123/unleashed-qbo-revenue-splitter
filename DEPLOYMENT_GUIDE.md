# Deployment Guide - Quick Version

## 1. Upload to GitHub

```bash
cd unleashed-qbo-revenue-splitter
npm install
git init
git add .
git commit -m "Initial Unleashed QBO revenue splitter"
git branch -M main
git remote add origin https://github.com/YOUR-USER/unleashed-qbo-revenue-splitter.git
git push -u origin main
```

## 2. Supabase

1. Create a new Supabase project.
2. Open SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. Copy:
   - Project URL
   - Service Role Key

## 3. Intuit Developer / QuickBooks

1. Create an Intuit Developer app.
2. Select QuickBooks Online Accounting scope.
3. Add redirect URI:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/api/qbo/callback
```

4. Copy Client ID and Client Secret.

## 4. Vercel variables

Add these in Vercel → Project → Settings → Environment Variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
APP_BASE_URL=https://your-vercel-domain.vercel.app
APP_CRON_SECRET=make-a-long-random-password
QBO_ENVIRONMENT=sandbox
QBO_CLIENT_ID=your_intuit_client_id
QBO_CLIENT_SECRET=your_intuit_client_secret
```

## 5. Test order

1. Open `/settings`.
2. Save Unleashed credentials.
3. Connect QuickBooks.
4. Open `/mapping`.
5. Refresh groups and accounts.
6. Map each group.
7. Open `/sync`.
8. Run sync.

## 6. Important production warning

Before production, disable Sales Invoice sync/export in native Unleashed QuickBooks integration or you risk duplicate invoices.
