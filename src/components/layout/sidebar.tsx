'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Globe, Settings, Plus, Menu, X, ShieldCheck, Eye } from 'lucide-react';

const nav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crawl', label: 'New Crawl', icon: Plus },
  { href: '/counter-measure', label: 'Counter Measure', icon: ShieldCheck },
  { href: '/page-analyser', label: 'Page Analyser', icon: Eye },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile header bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-surface border-b border-border flex items-center px-4 z-50 lg:hidden">
        <button onClick={() => setOpen(true)} className="p-2.5 -ml-2 text-muted hover:text-text active:text-accent touch-manipulation">
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/" className="flex items-center gap-2 text-accent font-bold ml-3">
          <Globe className="w-4 h-4" />
          InnotekSEO
        </Link>
      </div>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/60 z-[60] lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar drawer — fixed overlay on mobile, sticky in-flow column on desktop */}
      <aside
        className={`fixed top-0 left-0 h-screen w-60 bg-surface border-r border-border flex flex-col z-[70]
          transition-transform duration-200 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:sticky lg:translate-x-0 lg:z-auto lg:flex-shrink-0 lg:self-start`}
      >
        <div className="p-5 border-b border-border flex items-center justify-between">
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2 text-accent font-bold text-lg">
            <Globe className="w-5 h-5" />
            InnotekSEO
          </Link>
          <button onClick={() => setOpen(false)} className="p-1 text-muted hover:text-text lg:hidden">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="px-5 pt-2 text-muted text-xs">Browser AI &middot; WebLLM</p>

        <nav className="flex-1 p-3 space-y-1 mt-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-3.5 lg:py-2.5 rounded-lg text-base lg:text-sm transition-colors touch-manipulation ${
                  active
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:text-text hover:bg-surface2'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <p className="text-muted text-xs">v4.0 &middot; WebLLM</p>
        </div>
      </aside>
    </>
  );
}
