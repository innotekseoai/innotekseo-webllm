'use client';

import Link from 'next/link';
import { StatusBadge, GradeBadge } from '@/components/ui/badge';

interface CrawlRow {
  id: string;
  baseUrl: string;
  status: string;
  pagesCrawled: number;
  overallGrade: string | null;
  premiumScore: number | null;
  createdAt: string;
}

interface CrawlListProps {
  crawls: CrawlRow[];
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

export function CrawlList({ crawls, selectedIds, onSelectionChange }: CrawlListProps) {
  const selectable = !!onSelectionChange;

  if (crawls.length === 0) {
    return (
      <div className="text-center py-16 text-muted">
        <p className="text-lg mb-2">No crawls found</p>
        <p className="text-sm">Try adjusting your filters or start a new crawl.</p>
      </div>
    );
  }

  function toggleSelect(id: string) {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  function toggleAll() {
    if (!selectedIds || !onSelectionChange) return;
    if (selectedIds.size === crawls.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(crawls.map((c) => c.id)));
    }
  }

  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm min-w-[540px]">
        <thead>
          <tr className="border-b border-border text-muted text-left">
            {selectable && (
              <th className="pb-3 pr-2 w-8">
                <input
                  type="checkbox"
                  checked={selectedIds?.size === crawls.length && crawls.length > 0}
                  onChange={toggleAll}
                  className="accent-accent"
                />
              </th>
            )}
            <th className="pb-3 pr-4 font-medium">URL</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 pr-4 font-medium">Pages</th>
            <th className="pb-3 pr-4 font-medium">Grade</th>
            <th className="pb-3 pr-4 font-medium">Score</th>
            <th className="pb-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {crawls.map((crawl) => (
            <tr key={crawl.id} className="border-b border-border/50 hover:bg-surface2/50 transition-colors">
              {selectable && (
                <td className="py-3 pr-2">
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(crawl.id) ?? false}
                    onChange={() => toggleSelect(crawl.id)}
                    className="accent-accent"
                  />
                </td>
              )}
              <td className="py-3 pr-4">
                <Link href={`/crawl/detail?id=${crawl.id}`} className="text-accent hover:underline truncate block max-w-xs">
                  {crawl.baseUrl}
                </Link>
              </td>
              <td className="py-3 pr-4">
                <StatusBadge status={crawl.status} />
              </td>
              <td className="py-3 pr-4 text-muted">{crawl.pagesCrawled}</td>
              <td className="py-3 pr-4">
                {crawl.overallGrade ? <GradeBadge grade={crawl.overallGrade} /> : <span className="text-muted">--</span>}
              </td>
              <td className="py-3 pr-4 text-muted">
                {crawl.premiumScore != null ? `${crawl.premiumScore}/100` : '--'}
              </td>
              <td className="py-3 text-muted">
                {new Date(crawl.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
