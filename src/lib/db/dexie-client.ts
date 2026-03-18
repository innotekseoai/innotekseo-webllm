/**
 * IndexedDB storage via Dexie.js
 *
 * Replaces SQLite + Drizzle from v3. All data lives in the browser's
 * IndexedDB, persists across sessions, and supports reactive queries
 * via useLiveQuery.
 */

import Dexie, { type EntityTable } from 'dexie';

export interface CrawlRecord {
  id?: number;
  baseUrl: string;
  status: 'pending' | 'crawling' | 'analyzing' | 'completed' | 'failed';
  pagesCrawled: number;
  pageLimit: number;
  overallGrade: string | null;
  premiumScore: number | null;
  siteMetrics: string | null; // JSON string
  primaryJsonLd: string | null;
  llmsTxt: string | null;
  errorMessage: string | null;
  createdAt: string; // ISO date
}

export interface CrawlPageRecord {
  id?: number;
  crawlId: number;
  url: string;
  title: string | null;
  description: string | null;
  markdown: string;
  charCount: number;
  status: 'crawled' | 'analyzing' | 'analyzed' | 'failed';
}

export interface PageAnalysisRecord {
  id?: number;
  crawlId: number;
  crawlPageId: number;
  url: string;
  entityClarityScore: number | null;
  contentQualityScore: number | null;
  semanticStructureScore: number | null;
  entityRichnessScore: number | null;
  citationReadinessScore: number | null;
  technicalSeoScore: number | null;
  userIntentAlignmentScore: number | null;
  trustSignalsScore: number | null;
  authorityScore: number | null;
  factDensityCount: number | null;
  wordCount: number | null;
  jsonLd: string | null;
  llmsTxtEntry: string | null;
  geoRecommendations: string | null; // JSON array string
  scoreExplanations: string | null; // JSON object string
}

class InnotekSEODatabase extends Dexie {
  crawls!: EntityTable<CrawlRecord, 'id'>;
  crawlPages!: EntityTable<CrawlPageRecord, 'id'>;
  pageAnalyses!: EntityTable<PageAnalysisRecord, 'id'>;

  constructor() {
    super('innotekseo-webllm');

    this.version(1).stores({
      crawls: '++id, baseUrl, status, createdAt',
      crawlPages: '++id, crawlId, url, status',
      pageAnalyses: '++id, crawlId, crawlPageId, url',
    });
  }
}

export const db = new InnotekSEODatabase();
