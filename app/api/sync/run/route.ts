import { NextResponse } from 'next/server';
import { runInvoiceSync } from '@/lib/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');

  if (process.env.APP_CRON_SECRET && secret !== process.env.APP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const result = await runInvoiceSync({
    maxInvoices: Number(body.maxInvoices || 10),
    sinceDays: Number(body.sinceDays || 30),
    forceUpdate: Boolean(body.forceUpdate)
  });

  return NextResponse.json(result);
}
