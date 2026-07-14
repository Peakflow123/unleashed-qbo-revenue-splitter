'use client';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [form, setForm] = useState({ unleashed_api_id: '', unleashed_api_key: '', unleashed_client_type: 'Nexvista/revenue-splitter' });
  const [status, setStatus] = useState('');
  useEffect(() => { fetch('/api/settings').then(r=>r.json()).then(d=>setForm(f=>({...f, unleashed_api_id:d.unleashed_api_id||'', unleashed_client_type:d.unleashed_client_type||f.unleashed_client_type}))); }, []);
  async function save() { setStatus('Saving...'); const r = await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}); setStatus(r.ok?'Saved':'Failed'); }
  return <div className="card max-w-2xl"><h1 className="text-2xl font-bold">Settings</h1><div className="mt-6 space-y-4">
    <div><label className="label">Unleashed API ID</label><input className="input" value={form.unleashed_api_id} onChange={e=>setForm({...form,unleashed_api_id:e.target.value})}/></div>
    <div><label className="label">Unleashed API Key</label><input type="password" className="input" value={form.unleashed_api_key} onChange={e=>setForm({...form,unleashed_api_key:e.target.value})}/></div>
    <div><label className="label">Client Type</label><input className="input" value={form.unleashed_client_type} onChange={e=>setForm({...form,unleashed_client_type:e.target.value})}/></div>
    <div className="flex gap-3"><button className="btn" onClick={save}>Save Unleashed</button><a className="btn-secondary" href="/api/qbo/connect">Connect QuickBooks</a></div>
    {status && <p className="text-sm text-slate-600">{status}</p>}
  </div></div>;
}
