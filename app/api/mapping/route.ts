import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  const sb = supabaseAdmin();
  const [groups, accounts, mappings] = await Promise.all([
    sb.from('unleashed_product_groups').select('*').order('name'),
    sb.from('qbo_accounts').select('*').order('name'),
    sb.from('group_account_mappings').select('*')
  ]);
  return NextResponse.json({ groups: groups.data || [], accounts: accounts.data || [], mappings: mappings.data || [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const sb = supabaseAdmin();
  for (const m of body.mappings || []) {
    const account = body.accounts?.find((a: any) => a.qbo_id === m.qbo_account_id);
    await sb.from('group_account_mappings').upsert({
      unleashed_group_guid: m.unleashed_group_guid,
      unleashed_group_name: m.unleashed_group_name,
      qbo_account_id: m.qbo_account_id || null,
      qbo_account_name: account?.name || m.qbo_account_name || null,
      qbo_tax_code_id: m.qbo_tax_code_id || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'unleashed_group_guid' });
  }
  return NextResponse.json({ ok: true });
}
