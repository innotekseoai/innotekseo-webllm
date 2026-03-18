/**
 * React hook orchestrating the full crawl + analyze pipeline
 *
 * Performance optimizations:
 * - Throttled DB writes: crawl count updated every 3 pages instead of every page
 * - Main-thread yielding: setTimeout(0) between AI analyses to keep UI responsive
 * - Batched state updates: progress updates throttled to avoid render storms
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { db } from '@/lib/db/dexie-client';
import { crawlFromBrowser, type WebCrawlPage } from '@/lib/crawler/web-client';
import { analyzePageForGeo, type InferenceStats } from '@/lib/webllm/analyzer';
import { isModelLoaded } from '@/lib/webllm/engine';
import { aggregateResults } from '@/lib/analysis/engine';
import type { GeoPageAnalysis } from '@/types/analysis';

export interface InferenceLogEntry {
  url: string;
  output: string;
  stats: InferenceStats | null;
  status: 'streaming' | 'done' | 'failed' | 'skipped';
}

export interface CrawlerState {
  status: 'idle' | 'crawling' | 'analyzing' | 'completed' | 'failed';
  progress: number;
  message: string;
  crawlId: number | null;
  pageCount: number;
  analyzedCount: number;
  /** Live inference log — latest entry is the current/most recent page */
  inferenceLog: InferenceLogEntry[];
}

/** Yield main thread so React can process pending renders and user input */
const yieldThread = () => new Promise<void>((r) => setTimeout(r, 0));

/** Build default scores when AI inference fails or is skipped */
function buildDefaultAnalysis(url: string, markdown: string): GeoPageAnalysis {
  const path = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  return {
    json_ld: JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', url }),
    llms_txt_entry: `- [Page](${path}): Content page`,
    entity_clarity_score: 5,
    fact_density_count: 0,
    word_count: markdown.split(/\s+/).length,
    content_quality_score: 5,
    semantic_structure_score: 5,
    entity_richness_score: 5,
    citation_readiness_score: 5,
    technical_seo_score: 5,
    user_intent_alignment_score: 5,
    trust_signals_score: 5,
    authority_score: 5,
    geo_recommendations: [],
  };
}

/**
 * Create a crawl record in Dexie. Returns the crawlId instantly.
 * Does NOT start the crawl — call executeCrawl() for that.
 */
export async function createCrawl(
  baseUrl: string,
  options: { limit?: number; analyze?: boolean },
): Promise<number> {
  const { limit = 5 } = options;

  const crawlId = await db.crawls.add({
    baseUrl,
    status: 'pending',
    pagesCrawled: 0,
    pageLimit: limit,
    overallGrade: null,
    premiumScore: null,
    siteMetrics: null,
    primaryJsonLd: null,
    llmsTxt: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
  });

  return crawlId as number;
}

export function useCrawler() {
  const [state, setState] = useState<CrawlerState>({
    status: 'idle',
    progress: 0,
    message: '',
    crawlId: null,
    pageCount: 0,
    analyzedCount: 0,
    inferenceLog: [],
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const runningRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeSetState = useCallback((updater: (s: CrawlerState) => CrawlerState) => {
    if (mountedRef.current) setState(updater);
  }, []);

  /**
   * Execute crawl + optional analysis for an existing crawl record.
   */
  const executeCrawl = useCallback(async (
    crawlId: number,
    baseUrl: string,
    options: { limit?: number; analyze?: boolean },
  ): Promise<void> => {
    const { limit = 5, analyze = true } = options;

    console.log('[useCrawler] executeCrawl called: crawlId=%d, runningRef=%s', crawlId, runningRef.current);
    if (runningRef.current) {
      console.log('[useCrawler] SKIPPED — already running');
      return;
    }
    runningRef.current = true;

    safeSetState(() => ({
      status: 'crawling',
      progress: 0,
      message: 'Starting crawl...',
      crawlId,
      pageCount: 0,
      analyzedCount: 0,
      inferenceLog: [],
    }));

    abortRef.current = new AbortController();

    try {
      await db.crawls.update(crawlId, { status: 'crawling' });

      let pagesInserted = 0;

      // Phase 1: Crawl
      const pages = await crawlFromBrowser(baseUrl, {
        limit,
        signal: abortRef.current.signal,
        onPage: async (page: WebCrawlPage, index: number) => {
          await db.crawlPages.add({
            crawlId,
            url: page.url,
            title: page.title,
            description: page.description,
            markdown: page.markdown,
            charCount: page.charCount,
            status: 'crawled',
          });

          pagesInserted++;

          // Throttle: update crawl count every 3 pages to reduce Dexie writes
          if (pagesInserted % 3 === 0 || pagesInserted === 1) {
            await db.crawls.update(crawlId, { pagesCrawled: pagesInserted });
          }

          safeSetState((s) => ({
            ...s,
            pageCount: index + 1,
            message: `Crawled: ${page.url}`,
          }));
        },
        onProgress: (message, progress) => {
          safeSetState((s) => ({ ...s, message, progress: Math.round(progress * 0.5) }));
        },
      });

      if (abortRef.current.signal.aborted) {
        await db.crawls.update(crawlId, { status: 'failed', errorMessage: 'Cancelled by user' });
        safeSetState((s) => ({ ...s, status: 'failed', message: 'Cancelled' }));
        runningRef.current = false;
        return;
      }

      // Final count update
      await db.crawls.update(crawlId, {
        pagesCrawled: pages.length,
        status: analyze && isModelLoaded() ? 'analyzing' : 'completed',
      });

      // Phase 2: Analyze
      if (analyze && isModelLoaded()) {
        safeSetState((s) => ({ ...s, status: 'analyzing', message: 'Starting AI analysis...', progress: 50 }));

        const crawlPages = await db.crawlPages.where('crawlId').equals(crawlId).toArray();
        const pageResults: Array<{ page_url: string; result: GeoPageAnalysis }> = [];
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 2;

        for (let i = 0; i < crawlPages.length; i++) {
          if (abortRef.current.signal.aborted) break;

          const page = crawlPages[i];
          if (page.status === 'analyzed') continue;

          // Circuit breaker: if GPU keeps failing, skip AI and use defaults
          const useDefaults = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;

          await yieldThread();

          await db.crawlPages.update(page.id!, { status: 'analyzing' });

          let result: GeoPageAnalysis;

          if (useDefaults) {
            safeSetState((s) => ({
              ...s,
              message: `Using defaults (GPU unavailable): ${page.url}`,
              inferenceLog: [...s.inferenceLog, { url: page.url, output: '', stats: null, status: 'skipped' as const }],
            }));
            result = buildDefaultAnalysis(page.url, page.markdown);
          } else {
            // Add streaming log entry
            safeSetState((s) => ({
              ...s,
              inferenceLog: [...s.inferenceLog, { url: page.url, output: '', stats: null, status: 'streaming' as const }],
            }));

            try {
              result = await analyzePageForGeo({
                url: page.url,
                markdown: page.markdown,
                baseUrl,
                onProgress: (msg) => {
                  safeSetState((s) => ({ ...s, message: msg }));
                },
                onToken: (_token, partialText) => {
                  safeSetState((s) => {
                    const log = [...s.inferenceLog];
                    if (log.length > 0) {
                      log[log.length - 1] = { ...log[log.length - 1], output: partialText };
                    }
                    return { ...s, inferenceLog: log };
                  });
                },
                onStats: (stats) => {
                  safeSetState((s) => {
                    const log = [...s.inferenceLog];
                    if (log.length > 0) {
                      log[log.length - 1] = { ...log[log.length - 1], stats, status: 'done' };
                    }
                    return { ...s, inferenceLog: log };
                  });
                },
              });
              consecutiveFailures = 0;
            } catch {
              consecutiveFailures++;
              safeSetState((s) => {
                const log = [...s.inferenceLog];
                if (log.length > 0) {
                  log[log.length - 1] = { ...log[log.length - 1], status: 'failed' };
                }
                return {
                  ...s,
                  message: `Inference failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${page.url}`,
                  inferenceLog: log,
                };
              });
              result = buildDefaultAnalysis(page.url, page.markdown);
            }
          }

          // Store result (AI or defaults)
          try {
            await db.transaction('rw', [db.pageAnalyses, db.crawlPages], async () => {
              await db.pageAnalyses.add({
                crawlId,
                crawlPageId: page.id!,
                url: page.url,
                entityClarityScore: result.entity_clarity_score,
                contentQualityScore: result.content_quality_score,
                semanticStructureScore: result.semantic_structure_score,
                entityRichnessScore: result.entity_richness_score,
                citationReadinessScore: result.citation_readiness_score,
                technicalSeoScore: result.technical_seo_score,
                userIntentAlignmentScore: result.user_intent_alignment_score,
                trustSignalsScore: result.trust_signals_score,
                authorityScore: result.authority_score,
                factDensityCount: result.fact_density_count,
                wordCount: result.word_count,
                jsonLd: result.json_ld,
                llmsTxtEntry: result.llms_txt_entry,
                geoRecommendations: JSON.stringify(result.geo_recommendations),
                scoreExplanations: result.score_explanations ? JSON.stringify(result.score_explanations) : null,
              });
              await db.crawlPages.update(page.id!, { status: 'analyzed' });
            });
          } catch {
            await db.crawlPages.update(page.id!, { status: 'failed' });
          }

          pageResults.push({ page_url: page.url, result });
          safeSetState((s) => ({
            ...s,
            analyzedCount: i + 1,
            progress: 50 + Math.round(((i + 1) / crawlPages.length) * 50),
          }));

          await yieldThread();
        }

        if (pageResults.length > 0) {
          const aggregated = aggregateResults(baseUrl, pageResults);
          await db.crawls.update(crawlId, {
            status: 'completed',
            overallGrade: aggregated.site_metrics.overall_grade,
            premiumScore: aggregated.site_metrics.premium_score,
            siteMetrics: JSON.stringify(aggregated.site_metrics),
            primaryJsonLd: aggregated.primary_json_ld,
            llmsTxt: aggregated.llms_txt,
          });
        } else {
          await db.crawls.update(crawlId, { status: 'completed' });
        }
      }

      safeSetState((s) => ({ ...s, status: 'completed', progress: 100, message: 'Complete' }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await db.crawls.update(crawlId, { status: 'failed', errorMessage });
      safeSetState((s) => ({ ...s, status: 'failed', message: errorMessage }));
    } finally {
      runningRef.current = false;
    }
  }, [safeSetState]);

  const resumeAnalysis = useCallback(async (crawlId: number, baseUrl: string) => {
    if (!isModelLoaded()) return;

    safeSetState(() => ({
      status: 'analyzing',
      progress: 50,
      message: 'Resuming analysis...',
      crawlId,
      pageCount: 0,
      analyzedCount: 0,
      inferenceLog: [],
    }));
    abortRef.current = new AbortController();

    try {
      await db.crawls.update(crawlId, { status: 'analyzing' });

      const crawlPages = await db.crawlPages.where('crawlId').equals(crawlId).toArray();
      const unanalyzed = crawlPages.filter((p) => p.status !== 'analyzed');

      const existingAnalyses = await db.pageAnalyses.where('crawlId').equals(crawlId).toArray();
      const pageResults: Array<{ page_url: string; result: GeoPageAnalysis }> = [];

      for (const a of existingAnalyses) {
        pageResults.push({
          page_url: a.url,
          result: {
            json_ld: a.jsonLd ?? '',
            llms_txt_entry: a.llmsTxtEntry ?? '',
            entity_clarity_score: a.entityClarityScore ?? 5,
            fact_density_count: a.factDensityCount ?? 0,
            word_count: a.wordCount ?? 0,
            content_quality_score: a.contentQualityScore ?? 5,
            semantic_structure_score: a.semanticStructureScore ?? 5,
            entity_richness_score: a.entityRichnessScore ?? 5,
            citation_readiness_score: a.citationReadinessScore ?? 5,
            technical_seo_score: a.technicalSeoScore ?? 5,
            user_intent_alignment_score: a.userIntentAlignmentScore ?? 5,
            trust_signals_score: a.trustSignalsScore ?? 5,
            authority_score: a.authorityScore ?? 5,
            geo_recommendations: a.geoRecommendations ? JSON.parse(a.geoRecommendations) : [],
          },
        });
      }

      for (let i = 0; i < unanalyzed.length; i++) {
        if (abortRef.current.signal.aborted) break;
        const page = unanalyzed[i];

        await yieldThread();
        await db.crawlPages.update(page.id!, { status: 'analyzing' });

        try {
          const result = await analyzePageForGeo({
            url: page.url,
            markdown: page.markdown,
            baseUrl,
            onProgress: (msg) => safeSetState((s) => ({ ...s, message: msg })),
          });

          await db.transaction('rw', [db.pageAnalyses, db.crawlPages], async () => {
            await db.pageAnalyses.add({
              crawlId,
              crawlPageId: page.id!,
              url: page.url,
              entityClarityScore: result.entity_clarity_score,
              contentQualityScore: result.content_quality_score,
              semanticStructureScore: result.semantic_structure_score,
              entityRichnessScore: result.entity_richness_score,
              citationReadinessScore: result.citation_readiness_score,
              technicalSeoScore: result.technical_seo_score,
              userIntentAlignmentScore: result.user_intent_alignment_score,
              trustSignalsScore: result.trust_signals_score,
              authorityScore: result.authority_score,
              factDensityCount: result.fact_density_count,
              wordCount: result.word_count,
              jsonLd: result.json_ld,
              llmsTxtEntry: result.llms_txt_entry,
              geoRecommendations: JSON.stringify(result.geo_recommendations),
              scoreExplanations: result.score_explanations ? JSON.stringify(result.score_explanations) : null,
            });
            await db.crawlPages.update(page.id!, { status: 'analyzed' });
          });

          pageResults.push({ page_url: page.url, result });

          safeSetState((s) => ({
            ...s,
            analyzedCount: existingAnalyses.length + i + 1,
            progress: 50 + Math.round(((i + 1) / unanalyzed.length) * 50),
          }));
        } catch {
          await db.crawlPages.update(page.id!, { status: 'failed' });
        }

        await yieldThread();
      }

      if (pageResults.length > 0) {
        const aggregated = aggregateResults(baseUrl, pageResults);
        await db.crawls.update(crawlId, {
          status: 'completed',
          overallGrade: aggregated.site_metrics.overall_grade,
          premiumScore: aggregated.site_metrics.premium_score,
          siteMetrics: JSON.stringify(aggregated.site_metrics),
          primaryJsonLd: aggregated.primary_json_ld,
          llmsTxt: aggregated.llms_txt,
        });
      } else {
        await db.crawls.update(crawlId, { status: 'completed' });
      }

      safeSetState((s) => ({ ...s, status: 'completed', progress: 100, message: 'Analysis complete' }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await db.crawls.update(crawlId, { status: 'failed', errorMessage });
      safeSetState((s) => ({ ...s, status: 'failed', message: errorMessage }));
    }
  }, [safeSetState]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    ...state,
    executeCrawl,
    resumeAnalysis,
    cancel,
  };
}
