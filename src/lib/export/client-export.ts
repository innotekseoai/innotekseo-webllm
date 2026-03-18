/**
 * Client-side export to JSON and CSV
 *
 * Replaces server-side export API route. Creates Blob and triggers download.
 */

import type { CrawlRecord, CrawlPageRecord, PageAnalysisRecord } from '@/lib/db/dexie-client';

interface ExportData {
  crawl: CrawlRecord;
  pages: CrawlPageRecord[];
  analyses: PageAnalysisRecord[];
}

export function exportToJson(data: ExportData): void {
  const json = JSON.stringify(data, null, 2);
  downloadBlob(json, `crawl-${data.crawl.id}.json`, 'application/json');
}

export function exportToCsv(data: ExportData): void {
  const analysisMap = new Map(data.analyses.map((a) => [a.url, a]));

  const headers = [
    'URL', 'Title', 'Chars',
    'Entity Clarity', 'Content Quality', 'Semantic Structure',
    'Entity Richness', 'Citation Readiness', 'Technical SEO',
    'User Intent', 'Trust Signals', 'Authority',
    'Facts', 'Words',
  ];

  const rows = data.pages.map((page) => {
    const a = analysisMap.get(page.url);
    return [
      page.url,
      page.title ?? '',
      String(page.charCount),
      String(a?.entityClarityScore ?? ''),
      String(a?.contentQualityScore ?? ''),
      String(a?.semanticStructureScore ?? ''),
      String(a?.entityRichnessScore ?? ''),
      String(a?.citationReadinessScore ?? ''),
      String(a?.technicalSeoScore ?? ''),
      String(a?.userIntentAlignmentScore ?? ''),
      String(a?.trustSignalsScore ?? ''),
      String(a?.authorityScore ?? ''),
      String(a?.factDensityCount ?? ''),
      String(a?.wordCount ?? ''),
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');

  downloadBlob(csvContent, `crawl-${data.crawl.id}.csv`, 'text/csv');
}

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
