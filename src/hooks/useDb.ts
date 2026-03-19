/**
 * React hooks for Dexie IndexedDB queries
 *
 * Wraps Dexie's useLiveQuery for reactive data access.
 * Queries auto-update when underlying data changes.
 */

'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CrawlRecord, type CrawlPageRecord, type PageAnalysisRecord } from '@/lib/db/dexie-client';

/**
 * Get all crawls, sorted by creation date descending.
 * Supports optional search query and filters.
 */
export function useCrawls(options?: {
  q?: string;
  grade?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { q, grade, status, page = 1, limit = 20 } = options ?? {};

  const crawls = useLiveQuery(async () => {
    let collection = db.crawls.orderBy('createdAt');

    let all = await collection.reverse().toArray();

    // Apply filters
    if (q) {
      const query = q.toLowerCase();
      all = all.filter((c) => c.baseUrl.toLowerCase().includes(query));
    }
    if (grade) {
      all = all.filter((c) => c.overallGrade === grade);
    }
    if (status) {
      all = all.filter((c) => c.status === status);
    }

    const total = all.length;
    const offset = (page - 1) * limit;
    const paged = all.slice(offset, offset + limit);

    return { crawls: paged, total };
  }, [q, grade, status, page, limit]);

  return crawls ?? { crawls: [], total: 0 };
}

/**
 * Get a single crawl by ID with its pages and analyses.
 */
export function useCrawlDetail(crawlId: number | undefined) {
  return useLiveQuery(async () => {
    if (!crawlId) return null;

    const crawl = await db.crawls.get(crawlId);
    if (!crawl) return null;

    const pages = await db.crawlPages.where('crawlId').equals(crawlId).toArray();
    const analyses = await db.pageAnalyses.where('crawlId').equals(crawlId).toArray();

    return { crawl, pages, analyses };
  }, [crawlId]);
}

export interface CrawlIssueItem {
  crawlId: number;
  baseUrl: string;
  grade: string | null;
  createdAt: string;
  pageIssues: Array<{
    text: string;
    sourceUrl: string;
    crawlPageId: number;
  }>;
  siteIssues: string[];
}

/**
 * Returns all completed crawls with their critical issues aggregated
 * from per-page geoRecommendations and site-level siteMetrics.
 */
export function useCompletedCrawlsWithIssues(): CrawlIssueItem[] | undefined {
  return useLiveQuery(async () => {
    try {
      const crawls = await db.crawls
        .where('status').equals('completed')
        .reverse()
        .toArray();

      const items: CrawlIssueItem[] = [];

      for (const c of crawls) {
        const analyses = await db.pageAnalyses
          .where('crawlId').equals(c.id!)
          .toArray();

        const pageIssues: CrawlIssueItem['pageIssues'] = [];
        for (const a of analyses) {
          try {
            const recs: Array<{ priority: string; text: string }> = JSON.parse(a.geoRecommendations ?? '[]');
            for (const r of recs) {
              if (r.priority === 'critical') {
                pageIssues.push({ text: r.text, sourceUrl: a.url, crawlPageId: a.crawlPageId });
              }
            }
          } catch { /* skip malformed JSON */ }
        }

        let siteIssues: string[] = [];
        try {
          const sm = c.siteMetrics ? JSON.parse(c.siteMetrics) : null;
          siteIssues = Array.isArray(sm?.critical_issues) ? sm.critical_issues : [];
        } catch { /* skip malformed JSON */ }

        items.push({
          crawlId: c.id!,
          baseUrl: c.baseUrl,
          grade: c.overallGrade ?? null,
          createdAt: c.createdAt,
          pageIssues,
          siteIssues,
        });
      }

      return items;
    } catch {
      // Return empty array on IndexedDB errors rather than propagating to React error boundary
      return [];
    }
  }, []); // empty deps: run once on mount, re-run when observed tables change
}

/**
 * Delete crawls and their associated data.
 */
export async function deleteCrawls(ids: number[]): Promise<void> {
  await db.transaction('rw', [db.crawls, db.crawlPages, db.pageAnalyses], async () => {
    for (const id of ids) {
      await db.pageAnalyses.where('crawlId').equals(id).delete();
      await db.crawlPages.where('crawlId').equals(id).delete();
      await db.crawls.delete(id);
    }
  });
}

export { db, type CrawlRecord, type CrawlPageRecord, type PageAnalysisRecord };
