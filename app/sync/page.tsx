'use client';

import { useEffect, useState } from 'react';

export default function SyncPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [secret, setSecret] = useState('');
  const [running, setRunning] = useState(false);
  const [maxInvoices, setMaxInvoices] = useState(10);
  const [sinceDays, setSinceDays] = useState(30);
  const [forceUpdate, setForceUpdate] = useState(false);

  const load = () => fetch('/api/sync/logs').then((r) => r.json()).then(setLogs);

  useEffect(() => {
    load();
  }, []);

  async function run() {
    setRunning(true);
    setMsg('Running sync. Please wait...');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const r = await fetch('/api/sync/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': secret
        },
        body: JSON.stringify({ maxInvoices, sinceDays, forceUpdate }),
        signal: controller.signal
      });

      clearTimeout(timeout);
      const j = await r.json();

      if (!r.ok) {
        setMsg(`Sync failed: ${j.error || JSON.stringify(j)}`);
      } else {
        setMsg(
          `Sync completed. Checked: ${j.checked}, Created/Updated: ${j.processed}, Skipped: ${j.skipped}, Failed: ${j.failed}`
        );
      }

      await load();
    } catch (e: any) {
      setMsg(e.name === 'AbortError' ? 'Sync timed out after 90 seconds. Try lower invoice limit.' : `Sync failed: ${e.message}`);
      await load();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-2xl font-bold">Invoice Sync</h1>
        <p className="mt-2 text-sm text-slate-600">Only Unleashed Sales Invoices are processed.</p>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div>
            <label className="label">APP_CRON_SECRET</label>
            <input className="input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
          </div>
          <div>
            <label className="label">Max invoices per run</label>
            <input className="input" type="number" value={maxInvoices} onChange={(e) => setMaxInvoices(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Look back days</label>
            <input className="input" type="number" value={sinceDays} onChange={(e) => setSinceDays(Number(e.target.value))} />
          </div>
          <div className="flex items-end gap-2">
            <input id="forceUpdate" type="checkbox" checked={forceUpdate} onChange={(e) => setForceUpdate(e.target.checked)} />
            <label htmlFor="forceUpdate" className="text-sm font-medium">Update existing QBO invoices</label>
          </div>
        </div>

        <button className="btn mt-4" onClick={run} disabled={running || !secret}>
          {running ? 'Sync Running...' : 'Sync Invoices Now'}
        </button>

        {msg && <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{msg}</p>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th>Invoice</th>
              <th>Status</th>
              <th>QBO ID</th>
              <th>Message</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="py-2">{l.unleashed_invoice_number}</td>
                <td>{l.status}</td>
                <td>{l.qbo_invoice_id}</td>
                <td>{l.message}</td>
                <td>{l.updated_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
