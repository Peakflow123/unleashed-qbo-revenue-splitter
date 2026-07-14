import { NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/qbo';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  if (!code || !realmId) return NextResponse.json({ error: 'Missing code or realmId' }, { status: 400 });
  const token = await exchangeCode(code);
  await supabaseAdmin().from('app_config').upsert({
    company_id: 'default', qbo_realm_id: realmId, qbo_access_token: token.access_token,
    qbo_refresh_token: token.refresh_token, updated_at: new Date().toISOString()
  }, { onConflict: 'company_id' });
  return NextResponse.redirect(`${process.env.APP_BASE_URL}/settings?connected=1`);
}
