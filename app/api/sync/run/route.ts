import { NextResponse } from 'next/server';
import { runInvoiceSync } from '@/lib/sync';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.APP_CRON_SECRET && secret !== process.env.APP_CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await runInvoiceSync();
  return NextResponse.json(result);
}
