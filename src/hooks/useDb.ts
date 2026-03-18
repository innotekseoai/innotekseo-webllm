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
