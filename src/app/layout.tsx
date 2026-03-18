'use client';

import { Sidebar } from '@/components/layout/sidebar';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <title>InnotekSEO WebLLM</title>
        <meta name="description" content="Client-side web crawler with browser GPU AI analysis" />
      </head>
      <body className="min-h-screen">
        <Sidebar />
        {/* pt-14 on mobile for the fixed header bar, lg:pt-0 + lg:ml-60 for desktop sidebar */}
        <main className="pt-14 px-4 pb-8 lg:pt-0 lg:ml-60 lg:p-8">{children}</main>
      </body>
    </html>
  );
}
