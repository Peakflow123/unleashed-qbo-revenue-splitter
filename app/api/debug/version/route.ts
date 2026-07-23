import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mask(value: string | undefined) {
  if (!value) return 'MISSING';
  const text = value.trim();
  if (text.length <= 8) return 'TOO_SHORT';
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: 'qbo-debug-pack-v2',
    time: new Date().toISOString(),
    env: {
      APP_BASE_URL: process.env.APP_BASE_URL || 'MISSING',
      QBO_ENVIRONMENT: process.env.QBO_ENVIRONMENT || 'MISSING',
      QBO_CLIENT_ID: mask(process.env.QBO_CLIENT_ID),
      QBO_CLIENT_SECRET: mask(process.env.QBO_CLIENT_SECRET),
      NEXT_PUBLIC_SUPABASE_URL: mask(process.env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: mask(process.env.SUPABASE_SERVICE_ROLE_KEY)
    }
  });
}
