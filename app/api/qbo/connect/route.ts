import { NextResponse } from 'next/server';
import { qboAuthUrl } from '@/lib/qbo';

export async function GET() {
  const state = crypto.randomUUID();
  return NextResponse.redirect(qboAuthUrl(state));
}
