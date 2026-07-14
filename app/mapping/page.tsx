'use client';
import { useEffect, useState } from 'react';

export default function MappingPage() {
  const [data,setData]=useState<any>({groups:[],accounts:[],mappings:[]}); const [msg,setMsg]=useState('');
  const load=()=>fetch('/api/mapping').then(r=>r.json()).then(setData);
  useEffect(()=>{load()},[]);
  async function refreshGroups(){setMsg('Refreshing groups...'); const r=await fetch('/api/unleashed/groups',{method:'POST'}); const j=await r.json(); setMsg(`Groups refreshed: ${j.count||0}`); load();}
  async function refreshAccounts(){setMsg('Refreshing accounts...'); const r=await fetch('/api/qbo/accounts',{method:'POST'}); const j=await r.json(); setMsg(`Accounts refreshed: ${j.count||0}`); load();}
  function selected(g:any){return data.mappings.find((m:any)=>m.unleashed_group_guid===g.guid)?.qbo_account_id||''}
  function update(group:any, val:string){const maps=data.groups.map((g:any)=>({unleashed_group_guid:g.guid,unleashed_group_name:g.name,qbo_account_id:g.guid===group.guid?val:selected(g)})); setData({...data,mappings:maps});}
  async function save(){setMsg('Saving mapping...'); await fetch('/api/mapping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mappings:data.mappings,accounts:data.accounts})}); setMsg('Mapping saved'); load();}
  return <div className="space-y-4"><div className="card"><h1 className="text-2xl font-bold">Product Group → Revenue Account Mapping</h1><div className="mt-4 flex gap-3"><button className="btn-secondary" onClick={refreshGroups}>Refresh Product Groups</button><button className="btn-secondary" onClick={refreshAccounts}>Refresh QBO Accounts</button><button className="btn" onClick={save}>Save Mapping</button></div>{msg&&<p className="mt-3 text-sm text-slate-600">{msg}</p>}</div>
  <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Unleashed Product Group</th><th>QuickBooks Income Account</th></tr></thead><tbody>{data.groups.map((g:any)=><tr key={g.guid} className="border-b"><td className="py-3 font-medium">{g.name}</td><td><select className="input" value={selected(g)} onChange={e=>update(g,e.target.value)}><option value="">Select account</option>{data.accounts.map((a:any)=><option key={a.qbo_id} value={a.qbo_id}>{a.name}</option>)}</select></td></tr>)}</tbody></table></div></div>;
}
