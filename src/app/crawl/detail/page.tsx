'use client';

import { Suspense, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { CrawlTerminal } from '@/components/crawl/crawl-terminal';
import type { ConsoleLine } from '@/components/crawl/crawl-terminal';
import { ProgressSteps } from '@/components/analysis/progress-steps';
import { ScoreChart } from '@/components/analysis/score-chart';
import { GradeBreakdown } from '@/components/analysis/grade-breakdown';
import { MetricBars } from '@/components/analysis/metric-bars';
import { Recommendations } from '@/components/analysis/recommendations';
import { PageScoreCell } from '@/components/crawl/page-score-cell';
import { ArrowLeft, Copy, RotateCcw, Square, ArrowUpDown, Download, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useCrawlDetail } from '@/hooks/useDb';
import { useCrawler, type InferenceLogEntry } from '@/hooks/useCrawler';
import { useWebLLM } from '@/hooks/useWebLLM';
import { exportToJson, exportToCsv } from '@/lib/export/client-export';
import { ReportModal } from '@/components/crawl/report-modal';

export default function CrawlDetailPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-muted">Loading...</div>}>
      <CrawlDetailContent />
    </Suspense>
  );
}

function CrawlDetailContent() {
  const searchParams = useSearchParams();
  const id = parseInt(searchParams.get('id') ?? '0', 10);
  const analyzeParam = searchParams.get('analyze') !== 'false';
  const limitParam = parseInt(searchParams.get('limit') ?? '50', 10);

  const data = useCrawlDetail(id || undefined);
  const crawler = useCrawler();
  const webllm = useWebLLM();
  const [copied, setCopied] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showReport, setShowReport] = useState(false);
  const startedRef = useRef(false);

  // Auto-start crawl when we land on a pending crawl (navigated from form)
  useEffect(() => {
    if (!data?.crawl || startedRef.current) return;
    if (data.crawl.status === 'pending') {
      startedRef.current = true;
      crawler.executeCrawl(data.crawl.id!, data.crawl.baseUrl, {
        limit: limitParam,
        analyze: analyzeParam,
      });
    }
  }, [data?.crawl, crawler.executeCrawl, limitParam, analyzeParam]);

  const handleResumeAnalysis = useCallback(async () => {
    if (!data?.crawl || !webllm.isReady) return;
    await crawler.resumeAnalysis(data.crawl.id!, data.crawl.baseUrl);
  }, [data?.crawl, webllm.isReady, crawler]);

  // Memoize terminal lines — must be above early returns (Rules of Hooks)
  const pages = data?.pages ?? [];
  const analyses = data?.analyses ?? [];
  const lines: ConsoleLine[] = useMemo(
    () => pages.map((p, i) => ({
      type: 'page' as const,
      data: { url: p.url, title: p.title ?? '', charCount: p.charCount, index: i },
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages.length],
  );

  if (!id) {
    return <div className="text-center py-8 text-muted">No crawl ID specified</div>;
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading crawl data...</div>
      </div>
    );
  }

  const { crawl } = data;
  const sm = crawl.siteMetrics ? JSON.parse(crawl.siteMetrics) : null;

  // Prefer crawler hook status when it's tracking this crawl, fall back to Dexie
  const crawlerOwned = crawler.crawlId === crawl.id && crawler.status !== 'idle';
  const effectiveStatus = crawlerOwned ? crawler.status : crawl.status;
  const isLive = ['crawling', 'analyzing', 'pending'].includes(effectiveStatus);
  const isComplete = effectiveStatus === 'completed';
  const progress = crawlerOwned ? crawler.progress : (isComplete ? 100 : 0);
  const liveMessage = crawlerOwned ? crawler.message : '';

  // Count analyzed pages from Dexie for progress even when hook state doesn't update
  const analyzedFromDb = analyses.length;
  const totalPages = pages.length;
  const analysisProgress = totalPages > 0 ? Math.round((analyzedFromDb / totalPages) * 100) : 0;

  const steps: Array<{ label: string; status: 'pending' | 'active' | 'completed' | 'error'; detail?: string }> = [
    {
      label: 'Crawling pages',
      status: effectiveStatus === 'crawling' || effectiveStatus === 'pending'
        ? 'active'
        : (pages.length > 0 || isComplete ? 'completed' : 'pending'),
      detail: `${pages.length} pages`,
    },
    {
      label: 'AI Analysis',
      status: effectiveStatus === 'analyzing' ? 'active' : (isComplete && sm ? 'completed' : 'pending'),
      detail: effectiveStatus === 'analyzing'
        ? `${analyzedFromDb}/${totalPages} pages analyzed`
        : undefined,
    },
  ];

  if (crawl.status === 'failed') {
    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      status: 'error',
      detail: crawl.errorMessage ?? 'Unknown error',
    };
  }

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  function handleExportCsv() {
    exportToCsv({ crawl, pages, analyses });
  }

  function handleExportJson() {
    exportToJson({ crawl, pages, analyses });
  }

  const premiumMetrics = sm ? [
    { label: 'Content Quality', value: sm.avg_content_quality },
    { label: 'Semantic Structure', value: sm.avg_semantic_structure },
    { label: 'Entity Richness', value: sm.avg_entity_richness },
    { label: 'Citation Readiness', value: sm.avg_citation_readiness },
    { label: 'Technical SEO', value: sm.avg_technical_seo },
    { label: 'User Intent', value: sm.avg_user_intent },
    { label: 'Trust Signals', value: sm.avg_trust_signals },
    { label: 'Authority', value: sm.avg_authority },
  ] : [];

  return (
    <>
      <Header
        title={crawl.baseUrl}
        description={`Crawl started ${new Date(crawl.createdAt).toLocaleString()}`}
        actions={
          <div className="flex gap-2">
            {isLive && (
              <Button variant="secondary" size="sm" onClick={crawler.cancel}>
                <Square className="w-4 h-4" />
                Stop
              </Button>
            )}
            {(crawl.status === 'failed' || (crawl.status === 'completed' && !sm)) && webllm.isReady && (
              <Button variant="secondary" size="sm" onClick={handleResumeAnalysis}>
                <RotateCcw className="w-4 h-4" />
                Analyze
              </Button>
            )}
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <StatusBadge status={effectiveStatus} />
        {isComplete && (
          <div className="flex gap-1.5 ml-auto">
            <Button variant="ghost" size="sm" onClick={handleExportCsv}>
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportJson}>
              <Download className="w-3.5 h-3.5" /> JSON
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowReport(true)}>
              <Download className="w-3.5 h-3.5" /> Report
            </Button>
          </div>
        )}
        {isLive && (() => {
          // Show hook progress if available, otherwise derive from Dexie data
          const displayProgress = crawlerOwned
            ? progress
            : (effectiveStatus === 'analyzing' ? Math.round(50 + analysisProgress * 0.5) : 0);
          const displayMessage = liveMessage
            || (effectiveStatus === 'analyzing' ? `Analyzing page ${analyzedFromDb}/${totalPages}...` : '')
            || (effectiveStatus === 'crawling' ? `Crawling... ${pages.length} pages found` : '');
          return (
            <>
              <div className="flex-1 min-w-24 max-w-xs">
                <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-muted">{displayProgress}%</span>
              {displayMessage && <span className="text-xs text-muted truncate max-w-xs">{displayMessage}</span>}
            </>
          );
        })()}
      </div>

      {/* WebLLM loading progress */}
      {webllm.isLoading && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Loading AI Model</CardTitle></CardHeader>
          <div className="space-y-2">
            <div className="h-2 bg-surface2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${webllm.loadProgress.progress * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted">{webllm.loadProgress.text}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content area */}
        <div className="lg:col-span-2 space-y-6">
          {(isLive || lines.length > 0) && (
            <CrawlTerminal
              lines={lines}
              status={isLive ? (effectiveStatus === 'analyzing' ? 'analyzing' : 'crawling') : (isComplete ? 'completed' : effectiveStatus === 'failed' ? 'failed' : 'idle')}
              baseUrl={crawl.baseUrl}
            />
          )}

          {/* Inference log — auto-collapses completed entries after 2 pages */}
          {crawler.inferenceLog.length > 0 && (
            <InferenceLog entries={crawler.inferenceLog} />
          )}

          {isComplete && sm && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>GEO Score</CardTitle></CardHeader>
                  <div className="flex justify-center">
                    <ScoreChart score={crawl.premiumScore ?? 0} />
                  </div>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Grade Breakdown</CardTitle></CardHeader>
                  <GradeBreakdown
                    grade={crawl.overallGrade ?? 'F'}
                    entityClarity={sm.avg_entity_clarity}
                    wordsPerFact={sm.avg_words_per_fact}
                    schemaCompleteness={sm.schema_completeness_score}
                    totalFacts={sm.total_facts}
                  />
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>Premium Metrics</CardTitle></CardHeader>
                <MetricBars metrics={premiumMetrics} />
              </Card>

              <Card>
                <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
                {(sm.critical_issues ?? []).length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Critical Issues</p>
                    <ul className="space-y-2">
                      {(sm.critical_issues as string[]).map((issue, i) => (
                        <li key={i} className="flex items-start justify-between gap-3 text-sm">
                          <span className="text-text flex-1">{issue}</span>
                          <Link href={`/counter-measure?crawlId=${crawl.id}&issueIndex=${i}&type=critical`}>
                            <Button variant="ghost" size="sm">Fix →</Button>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Recommendations
                  priority={sm.priority_recommendations ?? []}
                  critical={[]}
                />
              </Card>
            </>
          )}

          {isComplete && pages.length > 0 && (() => {
            const analysisMap = new Map(analyses.map((a) => [a.url, a]));
            const pagesWithScores = pages.map((p, i) => {
              const a = analysisMap.get(p.url);
              const avgScore = a ? (
                ((a.entityClarityScore ?? 0) + (a.contentQualityScore ?? 0) + (a.semanticStructureScore ?? 0) +
                 (a.entityRichnessScore ?? 0) + (a.citationReadinessScore ?? 0) + (a.technicalSeoScore ?? 0) +
                 (a.userIntentAlignmentScore ?? 0) + (a.trustSignalsScore ?? 0) + (a.authorityScore ?? 0)) / 9
              ) : null;
              const explanations: Record<string, string> = a?.scoreExplanations ? JSON.parse(a.scoreExplanations) : {};
              return { ...p, index: i, analysis: a ?? null, avgScore, explanations };
            });

            const sorted = sortField ? [...pagesWithScores].sort((a, b) => {
              let va: number | null = null, vb: number | null = null;
              if (sortField === 'avg') { va = a.avgScore; vb = b.avgScore; }
              else if (sortField === 'clarity') { va = a.analysis?.entityClarityScore ?? null; vb = b.analysis?.entityClarityScore ?? null; }
              else if (sortField === 'quality') { va = a.analysis?.contentQualityScore ?? null; vb = b.analysis?.contentQualityScore ?? null; }
              else if (sortField === 'seo') { va = a.analysis?.technicalSeoScore ?? null; vb = b.analysis?.technicalSeoScore ?? null; }
              if (va === null && vb === null) return 0;
              if (va === null) return 1;
              if (vb === null) return -1;
              return sortDir === 'asc' ? va - vb : vb - va;
            }) : pagesWithScores;

            function toggleSort(field: string) {
              if (sortField === field) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
              } else {
                setSortField(field);
                setSortDir('desc');
              }
            }

            return (
              <Card>
                <CardHeader><CardTitle>Crawled Pages ({pages.length})</CardTitle></CardHeader>
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="border-b border-border text-muted text-left">
                        <th className="pb-2 pr-4 font-medium">#</th>
                        <th className="pb-2 pr-4 font-medium">URL</th>
                        <th className="pb-2 pr-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('avg')}>
                          Avg <ArrowUpDown className="w-3 h-3 inline" />
                        </th>
                        <th className="pb-2 pr-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('clarity')}>
                          Clarity <ArrowUpDown className="w-3 h-3 inline" />
                        </th>
                        <th className="pb-2 pr-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('quality')}>
                          Quality <ArrowUpDown className="w-3 h-3 inline" />
                        </th>
                        <th className="pb-2 pr-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('seo')}>
                          SEO <ArrowUpDown className="w-3 h-3 inline" />
                        </th>
                        <th className="pb-2 font-medium">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p) => (
                        <tr key={p.id} className="border-b border-border/30">
                          <td className="py-2 pr-4 text-muted">{p.index + 1}</td>
                          <td className="py-2 pr-4 truncate max-w-[200px]">
                            <a href={p.url} target="_blank" rel="noopener noreferrer"
                              className="text-accent hover:underline truncate"
                              title={p.url}
                            >{p.url}</a>
                          </td>
                          <td className="py-2 pr-2"><PageScoreCell score={p.avgScore} /></td>
                          <td className="py-2 pr-2" title={p.explanations.entity_clarity || undefined}>
                            <PageScoreCell score={p.analysis?.entityClarityScore ?? null} />
                          </td>
                          <td className="py-2 pr-2" title={p.explanations.content_quality || undefined}>
                            <PageScoreCell score={p.analysis?.contentQualityScore ?? null} />
                          </td>
                          <td className="py-2 pr-2" title={p.explanations.technical_seo || undefined}>
                            <PageScoreCell score={p.analysis?.technicalSeoScore ?? null} />
                          </td>
                          <td className="py-2 text-muted font-mono">
                            {p.charCount ? `${(p.charCount / 1000).toFixed(1)}k` : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })()}

          {isComplete && (crawl.primaryJsonLd || crawl.llmsTxt) && (
            <Card>
              <CardHeader><CardTitle>Outputs</CardTitle></CardHeader>
              <div className="space-y-4">
                {crawl.primaryJsonLd && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted">JSON-LD</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(crawl.primaryJsonLd!, 'jsonld')}
                      >
                        <Copy className="w-3 h-3" />
                        {copied === 'jsonld' ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <pre className="bg-[#0a0e17] border border-border rounded-lg p-3 text-xs text-accent3 overflow-x-auto max-h-48">
                      {crawl.primaryJsonLd}
                    </pre>
                  </div>
                )}
                {crawl.llmsTxt && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted">llms.txt</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(crawl.llmsTxt!, 'llms')}
                      >
                        <Copy className="w-3 h-3" />
                        {copied === 'llms' ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <pre className="bg-[#0a0e17] border border-border rounded-lg p-3 text-xs text-text overflow-x-auto max-h-48">
                      {crawl.llmsTxt}
                    </pre>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
            <ProgressSteps steps={steps} />
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Crawl ID</dt>
                <dd className="text-text font-mono text-xs">{crawl.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Page Limit</dt>
                <dd className="text-text">{crawl.pageLimit}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Pages Found</dt>
                <dd className="text-text">{pages.length}</dd>
              </div>
              {webllm.currentModel && (
                <div className="flex justify-between">
                  <dt className="text-muted">AI Model</dt>
                  <dd className="text-text text-xs truncate max-w-[160px]">{webllm.currentModel}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>

      {showReport && (
        <ReportModal
          crawl={crawl}
          pages={pages}
          analyses={analyses}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}

/**
 * Inference log with auto-collapsing completed entries.
 * Only the currently streaming entry shows full output.
 * Completed entries collapse to URL + stats, click to expand.
 */
function InferenceLog({ entries }: { entries: InferenceLogEntry[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries appear
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries.length]);

  function toggleExpand(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  // Auto-collapse: entries that are done/failed and not the last one
  const lastIdx = entries.length - 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>AI Inference Log</CardTitle>
          <span className="text-xs text-muted">{entries.length} pages</span>
        </div>
      </CardHeader>
      <div ref={logRef} className="max-h-64 overflow-y-auto space-y-1">
        {entries.map((entry, idx) => {
          const isLast = idx === lastIdx;
          const isStreaming = entry.status === 'streaming';
          // Show full output for: streaming entry, last entry, or user-expanded
          const showOutput = isStreaming || (isLast && entry.output) || expanded.has(idx);
          // Auto-collapse completed entries after first 2
          const isCollapsed = !showOutput && idx < lastIdx && entries.length > 2;

          const statusColor =
            entry.status === 'streaming' ? 'text-yellow-400 bg-yellow-400/10' :
            entry.status === 'done' ? 'text-green-400 bg-green-400/10' :
            entry.status === 'failed' ? 'text-red-400 bg-red-400/10' :
            'text-muted bg-surface2';

          const path = (() => {
            try { return new URL(entry.url).pathname; } catch { return entry.url; }
          })();

          if (isCollapsed) {
            return (
              <button
                key={idx}
                onClick={() => toggleExpand(idx)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface2/50 transition-colors text-left"
              >
                <ChevronRight className="w-3 h-3 text-muted flex-shrink-0" />
                <span className="text-xs text-muted truncate flex-1">{path}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${statusColor}`}>
                  {entry.status}
                </span>
                {entry.stats && (
                  <span className="text-[10px] text-muted flex-shrink-0">
                    {entry.stats.tokensPerSec.toFixed(0)} t/s
                  </span>
                )}
              </button>
            );
          }

          return (
            <div key={idx} className="border-b border-border/20 pb-2 last:border-0">
              <button
                onClick={() => entry.status !== 'streaming' ? toggleExpand(idx) : undefined}
                className="w-full flex items-center justify-between mb-1 text-left"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {entry.status !== 'streaming' && (
                    <ChevronDown className="w-3 h-3 text-muted flex-shrink-0" />
                  )}
                  <span className="text-xs text-accent truncate">{path}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${statusColor}`}>
                  {isStreaming ? 'generating...' : entry.status}
                </span>
              </button>
              {entry.output && (
                <pre className="text-[11px] text-muted bg-[#0a0e17] rounded p-2 overflow-x-auto max-h-28 whitespace-pre-wrap font-mono leading-relaxed">
                  {entry.output}
                  {isStreaming && <span className="animate-pulse">|</span>}
                </pre>
              )}
              {entry.stats && (
                <div className="flex gap-3 mt-1 text-[10px] text-muted">
                  <span>{entry.stats.tokensPerSec.toFixed(1)} tok/s</span>
                  <span>{entry.stats.completionTokens} tokens</span>
                  <span>{(entry.stats.elapsedMs / 1000).toFixed(1)}s</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
