'use client';

import { Suspense, useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCrawls, useCrawlDetail } from '@/hooks/useDb';
import type { CrawlPageRecord, PageAnalysisRecord } from '@/hooks/useDb';
import { useWebLLM } from '@/hooks/useWebLLM';
import { chatCompletion } from '@/lib/webllm/engine';
import type { InferenceStats } from '@/lib/webllm/engine';
import { CONTEXT_GENERATION_SYSTEM, buildContextGenerationPrompt } from '@/lib/ai/context-generation-prompt';
import { smartTruncate } from '@/lib/ai/truncate';
import { Settings, Copy, FileDown, ExternalLink, RefreshCw } from 'lucide-react';
import { unloadModel, loadModel } from '@/lib/webllm/engine';

export default function PageAnalyserPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-muted">Loading...</div>}>
      <PageAnalyserContent />
    </Suspense>
  );
}

type GenStatus = 'idle' | 'generating' | 'done' | 'error';

function extractHeadings(markdown: string, max = 8): string[] {
  return markdown
    .split('\n')
    .filter(l => /^#{1,3}\s/.test(l))
    .map(l => l.replace(/^#+\s/, '').trim())
    .slice(0, max);
}

function PageAnalyserContent() {
  const webllm = useWebLLM();
  const { crawls } = useCrawls({ status: 'completed' });

  const [selectedCrawlId, setSelectedCrawlId] = useState<number | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [status, setStatus] = useState<GenStatus>('idle');
  const [output, setOutput] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [stats, setStats] = useState<InferenceStats | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genWarning, setGenWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [compactOverride, setCompactOverride] = useState<boolean | null>(null);

  const outputRef = useRef('');
  const outputDivRef = useRef<HTMLDivElement>(null);

  const gpuDegraded = !webllm.hasWebGPU
    || webllm.gpuInfo?.tier === 'integrated'
    || webllm.gpuInfo?.tier === 'software'
    || webllm.gpuInfo?.degraded === true;
  const compact = compactOverride !== null ? compactOverride : gpuDegraded;

  const maxTokens = compact ? 512   : 2000;
  const timeoutMs = compact ? 45_000 : 180_000;
  const excerptLen = compact ? 0     : 2500;

  const crawlDetail = useCrawlDetail(selectedCrawlId ?? undefined);

  const pages = crawlDetail?.pages ?? [];
  const analyses = crawlDetail?.analyses ?? [];

  const selectedPage: CrawlPageRecord | null =
    selectedPageId != null ? (pages.find(p => p.id === selectedPageId) ?? null) : null;

  const selectedAnalysis: PageAnalysisRecord | null =
    selectedPage != null
      ? (analyses.find(a => a.crawlPageId === selectedPage.id) ?? null)
      : null;

  // Reset page selection when crawl changes
  useEffect(() => {
    setSelectedPageId(null);
    setIframeBlocked(false);
    resetOutput();
  }, [selectedCrawlId]);

  // Reset iframe state when page changes
  useEffect(() => {
    setIframeBlocked(false);
  }, [selectedPageId]);

  // Auto-scroll output while streaming
  useEffect(() => {
    if (outputDivRef.current && status === 'generating') {
      outputDivRef.current.scrollTop = outputDivRef.current.scrollHeight;
    }
  }, [output, status]);

  function resetOutput() {
    outputRef.current = '';
    setOutput('');
    setWordCount(0);
    setStats(null);
    setGenError(null);
    setGenWarning(null);
    setStatus('idle');
  }

  const handleToken = useCallback((_token: string, partial: string) => {
    outputRef.current = partial;
    setOutput(partial);
    setWordCount(partial.trim() ? partial.trim().split(/\s+/).length : 0);
  }, []);

  const handleStats = useCallback((s: InferenceStats) => {
    setStats(s);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedPage || !webllm.isReady || status === 'generating') return;

    outputRef.current = '';
    setOutput('');
    setWordCount(0);
    setStats(null);
    setGenError(null);
    setGenWarning(null);
    setStatus('generating');

    try {
      const markdown = selectedPage.markdown ?? '';
      const scores: Record<string, number> = selectedAnalysis ? {
        'Entity Clarity':     selectedAnalysis.entityClarityScore ?? 0,
        'Content Quality':    selectedAnalysis.contentQualityScore ?? 0,
        'Semantic Structure': selectedAnalysis.semanticStructureScore ?? 0,
        'Entity Richness':    selectedAnalysis.entityRichnessScore ?? 0,
        'Citation Readiness': selectedAnalysis.citationReadinessScore ?? 0,
        'Technical SEO':      selectedAnalysis.technicalSeoScore ?? 0,
        'User Intent':        selectedAnalysis.userIntentAlignmentScore ?? 0,
        'Trust Signals':      selectedAnalysis.trustSignalsScore ?? 0,
        'Authority':          selectedAnalysis.authorityScore ?? 0,
      } : {};

      await chatCompletion(
        CONTEXT_GENERATION_SYSTEM,
        buildContextGenerationPrompt({
          url: selectedPage.url,
          title: selectedPage.title ?? null,
          existingDescription: selectedPage.description ?? null,
          markdownExcerpt: excerptLen > 0 ? smartTruncate(markdown, excerptLen) : '',
          pageHeadings: markdown ? extractHeadings(markdown) : [],
          scores,
          hasExistingSchema: !!(selectedAnalysis?.jsonLd),
          wordCount: selectedAnalysis?.wordCount ?? undefined,
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
  }, [selectedPage, selectedAnalysis, webllm.isReady, status, compact, maxTokens, timeoutMs, excerptLen, handleToken, handleStats]);

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
    const title = selectedPage?.title ?? selectedPage?.url ?? 'Page';
    const body = outputRef.current.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Page Content</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:32px;line-height:1.6}
h1,h2,h3{margin-top:1.5em}pre{white-space:pre-wrap;word-break:break-word}</style>
</head><body><h1>Page Content Generation</h1><p style="color:#666">${title}</p>
<pre>${body}</pre></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }, [selectedPage]);

  const statusColors: Record<GenStatus, string> = {
    idle:       'text-muted bg-surface2',
    generating: 'text-yellow-400 bg-yellow-400/10',
    done:       'text-green-400 bg-green-400/10',
    error:      'text-red-400 bg-red-400/10',
  };

  const canGenerate = !!selectedPage && webllm.isReady && status !== 'generating';

  return (
    <>
      <Header
        title="Page Analyser"
        description="Inspect crawled pages and generate implementable SEO content"
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
        {/* ── Left 1/3: Crawl + Page Selector ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Select Page</CardTitle></CardHeader>

            {/* Crawl selector */}
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1.5">Completed Crawl</label>
              <select
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
                value={selectedCrawlId ?? ''}
                onChange={(e) => {
                  const id = parseInt(e.target.value, 10);
                  setSelectedCrawlId(isNaN(id) ? null : id);
                }}
              >
                <option value="">— Choose a crawl —</option>
                {crawls.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.baseUrl}{c.overallGrade ? ` (${c.overallGrade})` : ''} · {new Date(c.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Page list */}
            {pages.length > 0 && (
              <div>
                <p className="text-xs text-muted mb-2">{pages.length} pages crawled</p>
                <ul className="space-y-1 max-h-80 overflow-y-auto pr-1">
                  {pages.map((page) => {
                    const analysis = analyses.find(a => a.crawlPageId === page.id);
                    const avgScore = analysis ? [
                      analysis.entityClarityScore, analysis.contentQualityScore,
                      analysis.semanticStructureScore, analysis.entityRichnessScore,
                      analysis.citationReadinessScore, analysis.technicalSeoScore,
                      analysis.userIntentAlignmentScore, analysis.trustSignalsScore,
                      analysis.authorityScore,
                    ].filter((v): v is number => v != null)
                      .reduce((a, b, _, arr) => a + b / arr.length, 0) : null;

                    const gradeColor = avgScore == null ? 'text-muted'
                      : avgScore >= 8 ? 'text-green-400'
                      : avgScore >= 6 ? 'text-yellow-400'
                      : 'text-red-400';

                    const isSelected = selectedPageId === page.id;
                    return (
                      <li key={page.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedPageId(page.id!)}
                          className={`w-full text-left p-2 rounded-lg border text-xs transition-colors ${
                            isSelected ? 'border-accent bg-accent/5' : 'border-border/40 hover:bg-surface2'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-text truncate flex-1">
                              {page.title ?? (new URL(page.url).pathname || '/')}
                            </span>
                            {avgScore != null && (
                              <span className={`font-mono font-bold flex-shrink-0 ${gradeColor}`}>
                                {avgScore.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <span className="text-muted truncate block">{page.url}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {selectedCrawlId && pages.length === 0 && (
              <p className="text-xs text-muted">No pages found for this crawl.</p>
            )}

            {!selectedCrawlId && crawls.length === 0 && (
              <p className="text-xs text-muted">No completed crawls found. Run a crawl first.</p>
            )}
          </Card>
        </div>

        {/* ── Middle 1/3: Page Viewer ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Page Viewer</CardTitle>
                {selectedPage && (
                  <a
                    href={selectedPage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </CardHeader>

            {selectedPage ? (
              <div className="space-y-3">
                {/* Page meta */}
                <div className="p-2.5 bg-surface2 rounded-lg border border-border/40 space-y-1">
                  {selectedPage.title && (
                    <p className="text-xs font-semibold text-text">{selectedPage.title}</p>
                  )}
                  {selectedPage.description && (
                    <p className="text-[10px] text-muted">{selectedPage.description}</p>
                  )}
                  <div className="flex gap-3 text-[10px] text-muted font-mono pt-0.5">
                    {selectedPage.charCount && <span>{selectedPage.charCount.toLocaleString()} chars</span>}
                    {selectedAnalysis?.wordCount && <span>{selectedAnalysis.wordCount} words</span>}
                    {selectedAnalysis?.jsonLd && <Badge variant="info" className="text-[9px]">Schema</Badge>}
                  </div>
                </div>

                {/* Iframe viewer */}
                {!iframeBlocked ? (
                  <div className="relative">
                    <iframe
                      key={selectedPage.url}
                      src={selectedPage.url}
                      className="w-full rounded border border-border/40 bg-white"
                      style={{ height: '320px' }}
                      sandbox="allow-same-origin allow-scripts"
                      onError={() => setIframeBlocked(true)}
                    />
                    <div className="absolute bottom-2 right-2">
                      <button
                        type="button"
                        onClick={() => setIframeBlocked(true)}
                        className="text-[9px] text-muted bg-surface/80 px-1.5 py-0.5 rounded"
                      >
                        Show markdown
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-muted">Markdown preview</p>
                      <button
                        type="button"
                        onClick={() => setIframeBlocked(false)}
                        className="text-[9px] text-accent hover:underline"
                      >
                        Try iframe
                      </button>
                    </div>
                    <div className="w-full h-80 overflow-y-auto bg-surface2 rounded border border-border/40 p-2.5 font-mono text-[10px] text-text whitespace-pre-wrap leading-relaxed">
                      {selectedPage.markdown
                        ? selectedPage.markdown.slice(0, 3000) + (selectedPage.markdown.length > 3000 ? '\n\n[truncated…]' : '')
                        : <span className="text-muted">No markdown content stored.</span>
                      }
                    </div>
                  </div>
                )}

                {/* Score bars */}
                {selectedAnalysis && (
                  <div className="p-2.5 bg-surface2 rounded-lg border border-border/40 space-y-1.5">
                    <p className="text-[10px] text-muted uppercase tracking-wide font-semibold mb-2">GEO Scores</p>
                    {[
                      ['Entity Clarity',     selectedAnalysis.entityClarityScore],
                      ['Content Quality',    selectedAnalysis.contentQualityScore],
                      ['Semantic Structure', selectedAnalysis.semanticStructureScore],
                      ['Entity Richness',    selectedAnalysis.entityRichnessScore],
                      ['Citation Readiness', selectedAnalysis.citationReadinessScore],
                      ['Technical SEO',      selectedAnalysis.technicalSeoScore],
                      ['User Intent',        selectedAnalysis.userIntentAlignmentScore],
                      ['Trust Signals',      selectedAnalysis.trustSignalsScore],
                      ['Authority',          selectedAnalysis.authorityScore],
                    ].map(([label, score]) => (
                      <div key={label as string} className="flex items-center gap-2">
                        <span className="text-[9px] text-muted w-28 flex-shrink-0">{label}</span>
                        <div className="flex-1 bg-border rounded-full h-1">
                          <div
                            className="h-1 rounded-full bg-accent"
                            style={{ width: `${((score as number | null) ?? 0) * 10}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-muted w-6 text-right">
                          {score != null ? (score as number).toFixed(0) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40">
                <p className="text-sm text-muted">Select a page from the list</p>
              </div>
            )}
          </Card>
        </div>

        {/* ── Right 1/3: Content Generation ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Content Generation</CardTitle>
                <Link href="/counter-measure" className="text-xs text-accent hover:underline">
                  Counter Measure →
                </Link>
              </div>
            </CardHeader>

            {/* Model warning */}
            {!webllm.isReady && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-xs text-yellow-400">
                  No AI model loaded.{' '}
                  <Link href="/settings" className="underline">Go to Settings</Link> to load a model first.
                </p>
              </div>
            )}

            {/* Compact mode toggle */}
            <div className="mb-4 space-y-3">
              <div className="flex items-center justify-between gap-3 p-2.5 bg-surface2 rounded-lg border border-border/50">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCompactOverride(compact ? false : true)}
                    className="relative rounded-full transition-colors flex-shrink-0 cursor-pointer bg-border"
                    style={{
                      height: '18px', width: '32px',
                      backgroundColor: compact ? 'var(--color-accent)' : undefined,
                    }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform"
                      style={{ transform: compact ? 'translateX(14px)' : undefined }}
                    />
                  </button>
                  <span className="text-xs text-muted">Compact mode</span>
                  {compactOverride === null && gpuDegraded && (
                    <span className="text-[10px] text-yellow-400">(auto)</span>
                  )}
                </div>
                <span className="text-[10px] text-muted font-mono">
                  {compact ? `meta+schema · ≤${maxTokens}t` : `5 sections · ≤${maxTokens}t`}
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
                  {status === 'generating' ? 'Generating…' : 'Generate Content'}
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

            {/* Output */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-text">Output</span>
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

            <div
              ref={outputDivRef}
              className="min-h-64 max-h-[500px] overflow-y-auto bg-[#0a0e17] rounded-lg p-3 font-mono text-xs text-text whitespace-pre-wrap leading-relaxed border border-border/30"
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
