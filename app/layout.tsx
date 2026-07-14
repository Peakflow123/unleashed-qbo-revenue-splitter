import './globals.css';
import Link from 'next/link';

export const metadata = { title: 'Unleashed QBO Revenue Splitter' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <nav className="border-b bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-lg font-bold">Revenue Splitter</Link>
              <div className="flex gap-4 text-sm font-medium">
                <Link href="/settings">Settings</Link>
                <Link href="/mapping">Mapping</Link>
                <Link href="/sync">Sync</Link>
              </div>
            </div>
          </nav>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
