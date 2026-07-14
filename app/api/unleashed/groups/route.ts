import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getProductGroups } from '@/lib/unleashed';

export async function POST() {
  const sb = supabaseAdmin();
  const { data: cfg } = await sb.from('app_config').select('*').eq('company_id','default').single();
  const groups = await getProductGroups({ apiId: cfg.unleashed_api_id, apiKey: cfg.unleashed_api_key, clientType: cfg.unleashed_client_type });
  for (const g of groups) {
    const name = g.GroupName || g.Name || g.ProductGroupName || g.Description;
    const guid = g.Guid || g.ProductGroupGuid || name;
    if (name) await sb.from('unleashed_product_groups').upsert({ guid, name, raw: g }, { onConflict: 'guid' });
  }
  return NextResponse.json({ ok: true, count: groups.length });
}
