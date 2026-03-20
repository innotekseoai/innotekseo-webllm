'use client';

import { Suspense, useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCompletedCrawlsWithIssues, useCrawlDetail } from '@/hooks/useDb';
import type { CrawlIssueItem } from '@/hooks/useDb';
import { useWebLLM } from '@/hooks/useWebLLM';
import { chatCompletion } from '@/lib/webllm/engine';
import type { InferenceStats } from '@/lib/webllm/engine';
import { COUNTER_MEASURE_SYSTEM, buildCounterMeasurePrompt } from '@/lib/ai/counter-measure-prompt';
import { smartTruncate } from '@/lib/ai/truncate';
import { Settings, Copy, FileDown, RefreshCw } from 'lucide-react';
import { unloadModel, loadModel } from '@/lib/webllm/engine';

export default function CounterMeasurePage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-muted">Loading...</div>}>
      <CounterMeasureContent />
    </Suspense>
  );
}

function extractHeadings(markdown: string, max = 8): string[] {
  return markdown
    .split('\n')
    .filter(l => /^#{1,3}\s/.test(l))
    .map(l => l.replace(/^#+\s/, '').trim())
    .slice(0, max);
}

type GenStatus = 'idle' | 'generating' | 'done' | 'error';

interface SelectedIssue {
  text: string;
  sourceUrl: string;
  crawlPageId: number | null;
}

function CounterMeasureContent() {
  const searchParams = useSearchParams();
  const webllm = useWebLLM();
  const crawlsWithIssues = useCompletedCrawlsWithIssues();

  const [selectedCrawlId, setSelectedCrawlId] = useState<number | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<SelectedIssue | null>(null);
  const [status, setStatus] = useState<GenStatus>('idle');
  const [output, setOutput] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [stats, setStats] = useState<InferenceStats | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genWarning, setGenWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloading, setReloading] = useState(false);
  // null = auto (derived from GPU tier); true/false = manual override
  const [compactOverride, setCompactOverride] = useState<boolean | null>(null);

  const outputRef = useRef('');
  const outputDivRef = useRef<HTMLDivElement>(null);
  const deepLinkedRef = useRef(false);

  // Auto-compact for integrated/software GPUs — their context windows and VRAM
  // can't sustain long generations. Manual override always takes precedence.
  const gpuDegraded = !webllm.hasWebGPU
    || webllm.gpuInfo?.tier === 'integrated'
    || webllm.gpuInfo?.tier === 'software'
    || webllm.gpuInfo?.degraded === true;
  const compact = compactOverride !== null ? compactOverride : gpuDegraded;

  // Token budget based on mode:
  //   compact : ~200 prompt tokens → 512 output tokens max, 45s timeout
  //   full    : ~700 prompt tokens → 2000 output tokens max, 3 min timeout
  const maxTokens  = compact ? 512   : 2000;
  const timeoutMs  = compact ? 45_000 : 180_000;
  const excerptLen = compact ? 0     : 2500;   // compact sends no excerpt

  const crawlDetail = useCrawlDetail(selectedCrawlId ?? undefined);

  // Deep-link: pre-select from URL params once data is ready
  useEffect(() => {
    if (deepLinkedRef.current) return;
    if (!crawlsWithIssues) return;

    const crawlIdParam = parseInt(searchParams.get('crawlId') ?? '0', 10);
    const issueIndex = parseInt(searchParams.get('issueIndex') ?? '0', 10);
    const type = searchParams.get('type');

    if (!crawlIdParam) return;

    const crawlItem = crawlsWithIssues.find((c) => c.crawlId === crawlIdParam);
    if (!crawlItem) return;

    deepLinkedRef.current = true;
    setSelectedCrawlId(crawlIdParam);

    if (type === 'critical' && crawlItem.siteIssues[issueIndex]) {
      setSelectedIssue({
        text: crawlItem.siteIssues[issueIndex],
        sourceUrl: crawlItem.baseUrl,
        crawlPageId: null,
      });
    }
  }, [crawlsWithIssues, searchParams]);

  // Auto-scroll output to bottom while streaming
  useEffect(() => {
    if (outputDivRef.current && status === 'generating') {
      outputDivRef.current.scrollTop = outputDivRef.current.scrollHeight;
    }
  }, [output, status]);

  const selectedCrawl = crawlsWithIssues?.find((c) => c.crawlId === selectedCrawlId) ?? null;

  // Resolve page/analysis records for the selected issue
  const resolvedPage = (selectedIssue?.crawlPageId != null && crawlDetail)
    ? (crawlDetail.pages.find((p) => p.id === selectedIssue.crawlPageId) ?? null)
    : null;

  const resolvedAnalysis = (selectedIssue?.crawlPageId != null && crawlDetail)
    ? (crawlDetail.analyses.find((a) => a.crawlPageId === selectedIssue.crawlPageId) ?? null)
    : null;

  // Find metric with lowest score for context
  const affectedMetric: string | null = resolvedAnalysis ? (() => {
    const scores: Array<[string, number | null | undefined]> = [
      ['entity clarity',       resolvedAnalysis.entityClarityScore],
      ['content quality',      resolvedAnalysis.contentQualityScore],
      ['semantic structure',   resolvedAnalysis.semanticStructureScore],
      ['entity richness',      resolvedAnalysis.entityRichnessScore],
      ['citation readiness',   resolvedAnalysis.citationReadinessScore],
      ['technical SEO',        resolvedAnalysis.technicalSeoScore],
      ['user intent',          resolvedAnalysis.userIntentAlignmentScore],
      ['trust signals',        resolvedAnalysis.trustSignalsScore],
      ['authority',            resolvedAnalysis.authorityScore],
    ];
    let minKey: string | null = null;
    let minVal = Infinity;
    for (const [k, v] of scores) {
      if (v != null && v < minVal) { minVal = v; minKey = k; }
    }
    return minKey;
  })() : null;

  const handleToken = useCallback((_token: string, partial: string) => {
    outputRef.current = partial;
    setOutput(partial);
    setWordCount(partial.trim() ? partial.trim().split(/\s+/).length : 0);
  }, []);

  const handleStats = useCallback((s: InferenceStats) => {
    setStats(s);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedIssue || !webllm.isReady || status === 'generating') return;

    outputRef.current = '';
    setOutput('');
    setWordCount(0);
    setStats(null);
    setGenError(null);
    setGenWarning(null);
    setStatus('generating');

    try {
      const markdown = resolvedPage?.markdown ?? '';
      const pageScores = resolvedAnalysis ? [
        resolvedAnalysis.entityClarityScore, resolvedAnalysis.contentQualityScore,
        resolvedAnalysis.semanticStructureScore, resolvedAnalysis.entityRichnessScore,
        resolvedAnalysis.citationReadinessScore, resolvedAnalysis.technicalSeoScore,
        resolvedAnalysis.userIntentAlignmentScore, resolvedAnalysis.trustSignalsScore,
        resolvedAnalysis.authorityScore,
      ].filter((v): v is number => v != null) : [];

      await chatCompletion(
        COUNTER_MEASURE_SYSTEM,
        buildCounterMeasurePrompt({
          issueText: selectedIssue.text,
          sourceUrl: selectedIssue.sourceUrl,
          baseUrl: selectedCrawl?.baseUrl ?? '',
          pageTitle: resolvedPage?.title ?? null,
          // compact mode sends no excerpt to save context window tokens
          markdownExcerpt: excerptLen > 0 ? smartTruncate(markdown, excerptLen) : '',
          affectedMetric,
          currentScore: pageScores.length
            ? pageScores.reduce((a, b) => a + b, 0) / pageScores.length
            : null,
          allScores: resolvedAnalysis ? {
            'Entity Clarity':     resolvedAnalysis.entityClarityScore ?? 0,
            'Content Quality':    resolvedAnalysis.contentQualityScore ?? 0,
            'Semantic Structure': resolvedAnalysis.semanticStructureScore ?? 0,
            'Entity Richness':    resolvedAnalysis.entityRichnessScore ?? 0,
            'Citation Readiness': resolvedAnalysis.citationReadinessScore ?? 0,
            'Technical SEO':      resolvedAnalysis.technicalSeoScore ?? 0,
            'User Intent':        resolvedAnalysis.userIntentAlignmentScore ?? 0,
            'Trust Signals':      resolvedAnalysis.trustSignalsScore ?? 0,
            'Authority':          resolvedAnalysis.authorityScore ?? 0,
          } : undefined,
          pageHeadings: markdown ? extractHeadings(markdown) : [],
          hasExistingSchema: resolvedAnalysis ? !!resolvedAnalysis.jsonLd : undefined,
          wordCount: resolvedAnalysis?.wordCount ?? undefined,
          compact,
        }),
        { onToken: handleToken, onStats: handleStats },
        { maxTokens, temperature: 0.7, timeoutMs },
      );

      setStatus('done');
    } catch (err) {
      const partial = outputRef.current;
      const isTimeout = err instanceof Error && err.message.includes('timeout');
      const isGpuErr = err instanceof Event;

      if ((isTimeout || isGpuErr) && partial.trim().length > 80) {
        // Partial generation is usable — preserve it instead of showing an error screen
        setStatus('done');
        setGenWarning(
          isTimeout
            ? `Generation timed out after ${timeoutMs / 1000}s — partial output shown. Switch to Compact mode or load a smaller/faster model for complete results.`
            : 'GPU error — partial output shown. Try reloading the model or switching to Compact mode.',
        );
      } else {
        const msg = err instanceof Error
          ? err.message
          : (isGpuErr ? 'GPU error during generation. Try reloading the model.' : String(err));
        setGenError(msg);
        setStatus('error');
      }
    }
  }, [selectedIssue, webllm.isReady, status, resolvedPage, resolvedAnalysis, selectedCrawl,
      affectedMetric, handleToken, handleStats, compact, maxTokens, timeoutMs, excerptLen]);

  // Full GPU flush: unload then reload the model to clear all VRAM allocations.
  // Use when VRAM climbs noticeably after several generations.
  const handleReloadModel = useCallback(async () => {
    if (!webllm.currentModel || reloading) return;
    setReloading(true);
    try {
      await unloadModel();
      await loadModel(webllm.currentModel);
    } finally {
      setReloading(false);
    }
  }, [webllm.currentModel, reloading]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(outputRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleSavePdf = useCallback(() => {
    const win = window.open('', '_blank');
    if (!win) return;
    const title = selectedIssue?.text?.slice(0, 80) ?? 'Issue';
    const body = outputRef.current.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Counter Measure</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:32px;line-height:1.6}
h1,h2,h3{margin-top:1.5em}pre{white-space:pre-wrap;word-break:break-word}</style>
</head><body><h1>Counter Measure</h1><p style="color:#666">${title}</p>
<pre>${body}</pre></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }, [selectedIssue]);

  const statusColors: Record<GenStatus, string> = {
    idle:       'text-muted bg-surface2',
    generating: 'text-yellow-400 bg-yellow-400/10',
    done:       'text-green-400 bg-green-400/10',
    error:      'text-red-400 bg-red-400/10',
  };

  const canGenerate = !!selectedIssue && webllm.isReady && status !== 'generating';

  return (
    <>
      <Header
        title="Counter Measure Generator"
        description="Generate actionable remediation documents for critical SEO issues"
        actions={
          !webllm.isReady ? (
            <Link href="/settings">
              <Button variant="secondary" size="sm">
                <Settings className="w-4 h-4" />
                Load AI Model
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left 2/3: Issue Picker ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Issue Picker</CardTitle></CardHeader>

            {/* Crawl selector */}
            <div className="mb-5">
              <label className="block text-xs text-muted mb-1.5">Select Crawl</label>
              <select
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
                value={selectedCrawlId ?? ''}
                onChange={(e) => {
                  const id = parseInt(e.target.value, 10);
                  setSelectedCrawlId(isNaN(id) ? null : id);
                  setSelectedIssue(null);
                }}
              >
                <option value="">— Choose a completed crawl —</option>
                {(crawlsWithIssues ?? []).map((c) => (
                  <option key={c.crawlId} value={c.crawlId}>
                    {c.baseUrl}{c.grade ? ` (${c.grade})` : ''} · {new Date(c.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Issue list */}
            {selectedCrawl && (
              <IssueList
                crawl={selectedCrawl}
                selectedIssue={selectedIssue}
                onSelect={setSelectedIssue}
              />
            )}

            {!selectedCrawl && crawlsWithIssues?.length === 0 && (
              <p className="text-sm text-muted">No completed crawls found. Run a crawl first.</p>
            )}

            {/* Selected issue context card */}
            {selectedIssue && (
              <div className="mt-5 p-3 bg-surface2 rounded-lg border border-border/50 space-y-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Selected Issue</p>
                <p className="text-xs text-text break-all">{selectedIssue.sourceUrl}</p>
                {affectedMetric && (
                  <Badge variant="info" className="text-[10px]">
                    Lowest metric: {affectedMetric}
                  </Badge>
                )}
                {resolvedPage?.markdown && (
                  <p className="text-[10px] text-muted">
                    Page content: {resolvedPage.markdown.length.toLocaleString()} chars · excerpt capped at 1,500
                  </p>
                )}
              </div>
            )}

            {/* Model warning */}
            {!webllm.isReady && (
              <div className="mt-5 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-xs text-yellow-400">
                  No AI model loaded.{' '}
                  <Link href="/settings" className="underline">Go to Settings</Link> to load a model first.
                </p>
              </div>
            )}

            {/* Compact mode toggle + GPU warning */}
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3 p-2.5 bg-surface2 rounded-lg border border-border/50">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCompactOverride(compact ? false : true)}
                    className={`relative w-8 h-4.5 rounded-full transition-colors flex-shrink-0 ${compact ? 'bg-accent' : 'bg-border'} cursor-pointer`}
                    style={{ height: '18px', width: '32px' }}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${compact ? 'translate-x-3.5' : ''}`} />
                  </button>
                  <span className="text-xs text-muted">Compact mode</span>
                  {compactOverride === null && gpuDegraded && (
                    <span className="text-[10px] text-yellow-400">(auto — integrated GPU)</span>
                  )}
                </div>
                <span className="text-[10px] text-muted font-mono">
                  {compact
                    ? `4 sections · ≤${maxTokens} tokens · ${timeoutMs / 1000}s`
                    : `6 sections · ≤${maxTokens} tokens · ${timeoutMs / 1000}s`}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  disabled={!canGenerate}
                  onClick={handleGenerate}
                >
                  {status === 'generating' ? 'Generating…' : 'Generate Counter Measure'}
                </Button>
                {webllm.isReady && (
                  <Button
                    variant="secondary"
                    size="lg"
                    disabled={reloading || status === 'generating'}
                    onClick={handleReloadModel}
                    title="Flush GPU memory — unloads and reloads the model to clear VRAM"
                  >
                    <RefreshCw className={`w-4 h-4 ${reloading ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* ── Right 1/3: Output Preview ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Output</CardTitle>
                <div className="flex items-center gap-2">
                  {wordCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface2 text-muted font-mono">
                      {wordCount} words
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColors[status]}`}>
                    {status}
                  </span>
                </div>
              </div>
            </CardHeader>

            <div
              ref={outputDivRef}
              className="min-h-96 max-h-[600px] overflow-y-auto bg-[#0a0e17] rounded-lg p-3 font-mono text-xs text-text whitespace-pre-wrap leading-relaxed border border-border/30"
            >
              {output
                ? <>{output}{status === 'generating' && <span className="animate-pulse text-accent">|</span>}</>
                : <span className="text-muted/40">Output will stream here…</span>
              }
            </div>

            {genError && (
              <p className="mt-2 text-xs text-red-400 break-words">{genError}</p>
            )}

            {genWarning && (
              <p className="mt-2 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2 break-words">
                ⚠ {genWarning}
              </p>
            )}

            {/* Stats bar */}
            {status === 'done' && stats && (
              <div className="mt-2 flex gap-3 text-[10px] text-muted font-mono">
                <span>{stats.tokensPerSec.toFixed(1)} tok/s</span>
                <span>{stats.completionTokens} tokens</span>
                <span>{(stats.elapsedMs / 1000).toFixed(1)}s</span>
              </div>
            )}

            {/* Action row */}
            {status === 'done' && (
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCopy} className="flex-1">
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSavePdf} className="flex-1">
                  <FileDown className="w-3.5 h-3.5" />
                  Save as PDF
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

// ── Issue List subcomponent — avoids IIFE in JSX ──────────────────────────────

interface IssueListProps {
  crawl: CrawlIssueItem;
  selectedIssue: SelectedIssue | null;
  onSelect: (issue: SelectedIssue) => void;
}

function IssueList({ crawl, selectedIssue, onSelect }: IssueListProps) {
  const { siteIssues, pageIssues } = crawl;

  if (siteIssues.length === 0 && pageIssues.length === 0) {
    return <p className="text-sm text-muted">No critical issues found for this crawl.</p>;
  }

  return (
    <div className="space-y-5 mb-2">
      {siteIssues.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
            Site-Level Critical ({siteIssues.length})
          </p>
          <ul className="space-y-2">
            {siteIssues.map((issue, i) => {
              const isSelected =
                selectedIssue?.text === issue &&
                selectedIssue?.sourceUrl === crawl.baseUrl;
              return (
                <li
                  key={i}
                  className={`flex items-start justify-between gap-3 p-2 rounded-lg border transition-colors ${
                    isSelected ? 'border-accent bg-accent/5' : 'border-border/50'
                  }`}
                >
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span className="flex-shrink-0 mt-0.5 text-[10px] font-bold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                      {i + 1}
                    </span>
                    <span className="text-sm text-text">{issue}</span>
                  </div>
                  <Button
                    variant={isSelected ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => onSelect({ text: issue, sourceUrl: crawl.baseUrl, crawlPageId: null })}
                  >
                    {isSelected ? 'Selected' : 'Select'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pageIssues.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">
            Page-Level Critical ({pageIssues.length})
          </p>
          <ul className="space-y-2">
            {pageIssues.map((issue, i) => {
              const isSelected =
                selectedIssue?.text === issue.text &&
                selectedIssue?.sourceUrl === issue.sourceUrl;
              return (
                <li
                  key={i}
                  className={`flex items-start justify-between gap-3 p-2 rounded-lg border transition-colors ${
                    isSelected ? 'border-accent bg-accent/5' : 'border-border/50'
                  }`}
                >
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span className="flex-shrink-0 mt-0.5 text-[10px] font-bold bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text">{issue.text}</p>
                      <p className="text-[10px] text-muted truncate mt-0.5">{issue.sourceUrl}</p>
                    </div>
                  </div>
                  <Button
                    variant={isSelected ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() =>
                      onSelect({ text: issue.text, sourceUrl: issue.sourceUrl, crawlPageId: issue.crawlPageId })
                    }
                  >
                    {isSelected ? 'Selected' : 'Select'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
