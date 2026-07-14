import Link from 'next/link';

export default function Home() {
  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-3xl font-bold">Unleashed → QuickBooks Revenue Splitter</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Quick workaround app for syncing Unleashed sales invoices into QuickBooks Online with invoice revenue split by product group.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Link className="card hover:border-blue-400" href="/settings"><h2 className="font-bold">1. Settings</h2><p className="mt-2 text-sm text-slate-600">Add Unleashed credentials and connect QuickBooks.</p></Link>
        <Link className="card hover:border-blue-400" href="/mapping"><h2 className="font-bold">2. Mapping</h2><p className="mt-2 text-sm text-slate-600">Map Unleashed product groups to QBO income accounts.</p></Link>
        <Link className="card hover:border-blue-400" href="/sync"><h2 className="font-bold">3. Sync</h2><p className="mt-2 text-sm text-slate-600">Run invoice sync and review logs.</p></Link>
      </div>
    </div>
  );
}
