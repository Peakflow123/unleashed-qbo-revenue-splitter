import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);

  const { data } = await supabaseAdmin()
    .from('sync_log')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);

  return NextResponse.json(data || []);
}
