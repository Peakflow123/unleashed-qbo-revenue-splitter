import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const COMPANY_ID = 'default';

export async function GET() {
  const { data } = await supabaseAdmin().from('app_config').select('company_id,unleashed_api_id,unleashed_client_type,qbo_realm_id,updated_at').eq('company_id', COMPANY_ID).maybeSingle();
  return NextResponse.json(data || { company_id: COMPANY_ID });
}

export async function POST(req: Request) {
  const body = await req.json();
  await supabaseAdmin().from('app_config').upsert({
    company_id: COMPANY_ID,
    unleashed_api_id: body.unleashed_api_id,
    unleashed_api_key: body.unleashed_api_key,
    unleashed_client_type: body.unleashed_client_type || 'Nexvista/revenue-splitter',
    updated_at: new Date().toISOString()
  }, { onConflict: 'company_id' });
  return NextResponse.json({ ok: true });
}
