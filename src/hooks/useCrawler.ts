/**
 * React hook orchestrating the full crawl + analyze pipeline
 *
 * 1. Create crawl record in Dexie (status: 'crawling')
 * 2. Run crawlFromBrowser() with callbacks → insert pages into Dexie
 * 3. After crawl: auto-trigger analysis if model loaded
 * 4. Run analyzePageForGeo() for each page
 * 5. Run aggregateResults() from engine.ts
 * 6. Update crawl record with final grade/score/metrics
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { db } from '@/lib/db/dexie-client';
import { crawlFromBrowser, type WebCrawlPage } from '@/lib/crawler/web-client';
import { analyzePageForGeo } from '@/lib/webllm/analyzer';
import { isModelLoaded } from '@/lib/webllm/engine';
import { aggregateResults } from '@/lib/analysis/engine';
import type { GeoPageAnalysis } from '@/types/analysis';

export interface CrawlerState {
  status: 'idle' | 'crawling' | 'analyzing' | 'completed' | 'failed';
  progress: number;
  message: string;
  crawlId: number | null;
  pageCount: number;
  analyzedCount: number;
}

export function useCrawler() {
  const [state, setState] = useState<CrawlerState>({
    status: 'idle',
    progress: 0,
    message: '',
    crawlId: null,
    pageCount: 0,
    analyzedCount: 0,
  });

  const abortRef = useRef<AbortController | null>(null);

  const startCrawl = useCallback(async (
    baseUrl: string,
    options: { limit?: number; analyze?: boolean; modelId?: string },
  ): Promise<number | null> => {
    const { limit = 50, analyze = true } = options;

    // Create crawl record
    const crawlId = await db.crawls.add({
      baseUrl,
      status: 'crawling',
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

    setState({
      status: 'crawling',
      progress: 0,
      message: 'Starting crawl...',
      crawlId: crawlId as number,
      pageCount: 0,
      analyzedCount: 0,
    });

    abortRef.current = new AbortController();

    try {
      // Phase 1: Crawl
      const pages = await crawlFromBrowser(baseUrl, {
        limit,
        signal: abortRef.current.signal,
        onPage: async (page: WebCrawlPage, index: number) => {
          // Insert page into Dexie
          await db.crawlPages.add({
            crawlId: crawlId as number,
            url: page.url,
            title: page.title,
            description: page.description,
            markdown: page.markdown,
            charCount: page.charCount,
            status: 'crawled',
          });

          await db.crawls.update(crawlId as number, { pagesCrawled: index + 1 });

          setState((s) => ({
            ...s,
            pageCount: index + 1,
            message: `Crawled: ${page.url}`,
          }));
        },
        onProgress: (message, progress) => {
          setState((s) => ({ ...s, message, progress: Math.round(progress * 0.5) }));
        },
      });

      if (abortRef.current.signal.aborted) {
        await db.crawls.update(crawlId as number, { status: 'failed', errorMessage: 'Cancelled by user' });
        setState((s) => ({ ...s, status: 'failed', message: 'Cancelled' }));
        return crawlId as number;
      }

      await db.crawls.update(crawlId as number, {
        pagesCrawled: pages.length,
        status: analyze && isModelLoaded() ? 'analyzing' : 'completed',
      });

      // Phase 2: Analyze (if model is loaded)
      if (analyze && isModelLoaded()) {
        setState((s) => ({ ...s, status: 'analyzing', message: 'Starting AI analysis...', progress: 50 }));

        const crawlPages = await db.crawlPages.where('crawlId').equals(crawlId as number).toArray();
        const pageResults: Array<{ page_url: string; result: GeoPageAnalysis }> = [];

        for (let i = 0; i < crawlPages.length; i++) {
          if (abortRef.current.signal.aborted) break;

          const page = crawlPages[i];

          // Skip already analyzed
          if (page.status === 'analyzed') continue;

          await db.crawlPages.update(page.id!, { status: 'analyzing' });

          try {
            const result = await analyzePageForGeo({
              url: page.url,
              markdown: page.markdown,
              baseUrl,
              onProgress: (msg) => {
                setState((s) => ({ ...s, message: msg }));
              },
            });

            // Store analysis
            await db.pageAnalyses.add({
              crawlId: crawlId as number,
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

            pageResults.push({ page_url: page.url, result });
            setState((s) => ({
              ...s,
              analyzedCount: i + 1,
              progress: 50 + Math.round(((i + 1) / crawlPages.length) * 50),
            }));
          } catch {
            await db.crawlPages.update(page.id!, { status: 'failed' });
          }
        }

        // Aggregate results
        if (pageResults.length > 0) {
          const aggregated = aggregateResults(baseUrl, pageResults);
          await db.crawls.update(crawlId as number, {
            status: 'completed',
            overallGrade: aggregated.site_metrics.overall_grade,
            premiumScore: aggregated.site_metrics.premium_score,
            siteMetrics: JSON.stringify(aggregated.site_metrics),
            primaryJsonLd: aggregated.primary_json_ld,
            llmsTxt: aggregated.llms_txt,
          });
        } else {
          await db.crawls.update(crawlId as number, { status: 'completed' });
        }
      }

      setState((s) => ({ ...s, status: 'completed', progress: 100, message: 'Complete' }));
      return crawlId as number;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await db.crawls.update(crawlId as number, { status: 'failed', errorMessage });
      setState((s) => ({ ...s, status: 'failed', message: errorMessage }));
      return crawlId as number;
    }
  }, []);

  const resumeAnalysis = useCallback(async (crawlId: number, baseUrl: string) => {
    if (!isModelLoaded()) return;

    setState((s) => ({ ...s, crawlId, status: 'analyzing', message: 'Resuming analysis...', progress: 50 }));
    abortRef.current = new AbortController();

    try {
      await db.crawls.update(crawlId, { status: 'analyzing' });

      const crawlPages = await db.crawlPages.where('crawlId').equals(crawlId).toArray();
      const unanalyzed = crawlPages.filter((p) => p.status !== 'analyzed');

      // Also load existing analyses for aggregation
      const existingAnalyses = await db.pageAnalyses.where('crawlId').equals(crawlId).toArray();
      const pageResults: Array<{ page_url: string; result: GeoPageAnalysis }> = [];

      // Include already-analyzed pages in results
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

        await db.crawlPages.update(page.id!, { status: 'analyzing' });

        try {
          const result = await analyzePageForGeo({
            url: page.url,
            markdown: page.markdown,
            baseUrl,
            onProgress: (msg) => setState((s) => ({ ...s, message: msg })),
          });

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
          pageResults.push({ page_url: page.url, result });

          setState((s) => ({
            ...s,
            analyzedCount: existingAnalyses.length + i + 1,
            progress: 50 + Math.round(((i + 1) / unanalyzed.length) * 50),
          }));
        } catch {
          await db.crawlPages.update(page.id!, { status: 'failed' });
        }
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

      setState((s) => ({ ...s, status: 'completed', progress: 100, message: 'Analysis complete' }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await db.crawls.update(crawlId, { status: 'failed', errorMessage });
      setState((s) => ({ ...s, status: 'failed', message: errorMessage }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    ...state,
    startCrawl,
    resumeAnalysis,
    cancel,
  };
}
