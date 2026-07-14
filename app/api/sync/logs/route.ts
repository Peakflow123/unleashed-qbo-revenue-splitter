import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
export async function GET() {
  const { data } = await supabaseAdmin().from('sync_log').select('*').order('updated_at', { ascending: false }).limit(100);
  return NextResponse.json(data || []);
}
