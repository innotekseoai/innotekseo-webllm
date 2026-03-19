import type { Metadata } from 'next';
import { Sidebar } from '@/components/layout/sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'InnotekSEO WebLLM',
  description: 'Client-side web crawler with browser GPU AI analysis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      {/* lg:flex turns the body into a row: sidebar | main content (no overlay) */}
      <body className="min-h-screen lg:flex">
        <Sidebar />
        {/* Mobile: pt-14 for the fixed hamburger bar. Desktop: sidebar is in-flow, no margin needed */}
        <main className="flex-1 pt-14 px-4 pb-8 lg:pt-0 lg:p-8 min-w-0 overflow-x-hidden">{children}</main>
      </body>
    </html>
  );
}
