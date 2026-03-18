'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { CrawlList } from '@/components/crawl/crawl-list';
import { BulkActions } from '@/components/crawl/bulk-actions';
import { useCrawls, deleteCrawls } from '@/hooks/useDb';
import { useWebLLM } from '@/hooks/useWebLLM';
import { Plus, Globe, BarChart3, FileText, Search, ChevronLeft, ChevronRight, Cpu, Loader2, Zap, Play } from 'lucide-react';

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-muted">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const webllm = useWebLLM();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingModel, setLoadingModel] = useState<string | null>(null);

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = 20;
  const q = searchParams.get('q') ?? '';
  const gradeFilter = searchParams.get('grade') ?? '';
  const statusFilter = searchParams.get('status') ?? '';

  const { crawls: rawCrawls, total } = useCrawls({ q, grade: gradeFilter, status: statusFilter, page, limit });

  const crawls = rawCrawls.map((c) => ({
    id: String(c.id),
    baseUrl: c.baseUrl,
    status: c.status,
    pagesCrawled: c.pagesCrawled,
    overallGrade: c.overallGrade,
    premiumScore: c.premiumScore,
    createdAt: c.createdAt,
  }));

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!('page' in updates)) params.set('page', '1');
    router.push(`?${params.toString()}`);
  }

  const totalPages = Math.ceil(total / limit);
  const totalPagesCount = crawls.reduce((s, c) => s + c.pagesCrawled, 0);
  const graded = crawls.filter((c) => c.premiumScore != null);
  const avgScore = graded.length > 0
    ? Math.round(graded.reduce((s, c) => s + (c.premiumScore ?? 0), 0) / graded.length)
    : 0;

  async function handleBulkDelete(ids: string[]) {
    await deleteCrawls(ids.map(Number));
    setSelectedIds(new Set());
  }

  async function handleLoadModel(modelId: string) {
    setLoadingModel(modelId);
    await webllm.load(modelId);
    setLoadingModel(null);
  }

  // Models that are cached but not currently loaded
  const cachedModels = webllm.availableModels.filter(
    (m) => webllm.cacheStatus[m.id] && m.id !== webllm.currentModel,
  );

  return (
    <>
      <Header
        title="Dashboard"
        description="Overview of your crawl and analysis activity"
        actions={
          <Link href="/crawl">
            <Button>
              <Plus className="w-4 h-4" />
              New Crawl
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-muted">
              <Globe className="w-4 h-4" />
              <CardTitle>Total Crawls</CardTitle>
            </div>
          </CardHeader>
          <p className="text-3xl font-bold text-text">{total}</p>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-muted">
              <FileText className="w-4 h-4" />
              <CardTitle>Pages Crawled</CardTitle>
            </div>
          </CardHeader>
          <p className="text-3xl font-bold text-text">{totalPagesCount}</p>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-muted">
              <BarChart3 className="w-4 h-4" />
              <CardTitle>Avg Score</CardTitle>
            </div>
          </CardHeader>
          <p className="text-3xl font-bold text-accent">{avgScore > 0 ? `${avgScore}/100` : '--'}</p>
        </Card>
      </div>

      {/* AI Model quick-load card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-accent" />
            <CardTitle>AI Model</CardTitle>
          </div>
        </CardHeader>

        {webllm.isReady ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-green-400" />
              <span className="text-sm text-text">{webllm.currentModel}</span>
            </div>
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded">Ready</span>
          </div>
        ) : webllm.isLoading ? (
          <div className="space-y-2">
            <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${webllm.loadProgress.progress * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted">{webllm.loadProgress.text}</p>
          </div>
        ) : cachedModels.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">Previously downloaded models ready to load:</p>
            <div className="flex flex-wrap gap-2">
              {cachedModels.map((m) => (
                <Button
                  key={m.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleLoadModel(m.id)}
                  disabled={webllm.isBusy}
                  className="border border-border"
                >
                  {loadingModel === m.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">No models downloaded yet</p>
            <Link href="/settings">
              <Button variant="ghost" size="sm">
                <Cpu className="w-3 h-3" />
                Download Models
              </Button>
            </Link>
          </div>
        )}
      </Card>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search by domain..."
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateParams({ q: (e.target as HTMLInputElement).value });
              }
            }}
            className="w-full bg-surface2 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text
              placeholder:text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(e) => updateParams({ grade: e.target.value })}
          className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text
            focus:outline-none focus:border-accent/50"
        >
          <option value="">All Grades</option>
          {['A', 'B', 'C', 'D', 'F'].map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value })}
          className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text
            focus:outline-none focus:border-accent/50"
        >
          <option value="">All Statuses</option>
          {['pending', 'crawling', 'analyzing', 'completed', 'failed'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {selectedIds.size > 0 && (
        <BulkActions
          count={selectedIds.size}
          onDelete={() => handleBulkDelete(Array.from(selectedIds))}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {q || gradeFilter || statusFilter ? `Filtered Crawls (${total})` : 'Recent Crawls'}
          </CardTitle>
        </CardHeader>
        <CrawlList
          crawls={crawls}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <span className="text-sm text-muted">
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => updateParams({ page: String(page - 1) })}
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: String(page + 1) })}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
