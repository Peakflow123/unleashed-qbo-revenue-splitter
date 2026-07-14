import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { qboQuery } from '@/lib/qbo';

export async function POST() {
  const sb = supabaseAdmin();
  const result = await qboQuery('default', "select * from Account where AccountType = 'Income'");
  const accounts = result?.QueryResponse?.Account || [];
  for (const a of accounts) await sb.from('qbo_accounts').upsert({ qbo_id: a.Id, name: a.Name, account_type: a.AccountType, active: a.Active, raw: a }, { onConflict: 'qbo_id' });
  return NextResponse.json({ ok: true, count: accounts.length });
}
