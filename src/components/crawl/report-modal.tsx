'use client';

import { useEffect, useRef } from 'react';
import { X, FileDown } from 'lucide-react';
import type { CrawlRecord, CrawlPageRecord, PageAnalysisRecord } from '@/lib/db/dexie-client';

interface ReportModalProps {
  crawl: CrawlRecord;
  pages: CrawlPageRecord[];
  analyses: PageAnalysisRecord[];
  onClose: () => void;
}

function score(v: number | null | undefined): string {
  return v != null ? v.toFixed(1) : '—';
}

function pct(v: number | null | undefined): string {
  return v != null ? `${Math.round(v)}%` : '—';
}

function grade(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 90) return 'A';
  if (v >= 80) return 'B';
  if (v >= 70) return 'C';
  if (v >= 60) return 'D';
  return 'F';
}

function avgScores(a: PageAnalysisRecord): number | null {
  const vals = [
    a.entityClarityScore, a.contentQualityScore, a.semanticStructureScore,
    a.entityRichnessScore, a.citationReadinessScore, a.technicalSeoScore,
    a.userIntentAlignmentScore, a.trustSignalsScore, a.authorityScore,
  ].filter((v): v is number => v != null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

function barHtml(value: number | null | undefined, color: string): string {
  const v = value ?? 0;
  return `
    <div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${Math.min(100, Math.round(v))}%;background:${color};border-radius:4px"></div>
      </div>
      <span style="font-size:12px;font-weight:600;min-width:36px;text-align:right">${pct(value)}</span>
    </div>`;
}

function metricColor(value: number | null | undefined): string {
  const v = value ?? 0;
  if (v >= 80) return '#22c55e';
  if (v >= 60) return '#f59e0b';
  return '#ef4444';
}

function buildReportHtml(
  crawl: CrawlRecord,
  pages: CrawlPageRecord[],
  analyses: PageAnalysisRecord[],
): string {
  const sm = crawl.siteMetrics ? JSON.parse(crawl.siteMetrics) : null;
  const analysisMap = new Map(analyses.map((a) => [a.url, a]));
  const generatedAt = new Date().toLocaleString();
  const crawlDate = new Date(crawl.createdAt).toLocaleString();

  // Collect all recommendations across all pages
  const allRecs: Array<{ priority: string; text: string; url: string }> = [];
  for (const a of analyses) {
    try {
      const recs: Array<{ priority: string; text: string }> =
        JSON.parse(a.geoRecommendations ?? '[]');
      recs.forEach((r) => allRecs.push({ ...r, url: a.url }));
    } catch { /* skip */ }
  }
  const criticalRecs = allRecs.filter((r) => r.priority === 'critical');
  const highRecs = allRecs.filter((r) => r.priority === 'high');
  const mediumRecs = allRecs.filter((r) => r.priority === 'medium');

  const recsHtml = (recs: typeof criticalRecs, color: string, bg: string) =>
    recs.length === 0 ? '' : recs.map((r) => `
      <div style="margin-bottom:8px;padding:10px 12px;border-left:3px solid ${color};background:${bg};border-radius:0 6px 6px 0">
        <div style="font-size:10px;color:#888;margin-bottom:3px;word-break:break-all">${r.url}</div>
        <div style="font-size:12px;line-height:1.5">${r.text}</div>
      </div>`).join('');

  // Premium metrics definition with bar colors
  const premiumMetrics = sm ? [
    { label: 'Entity Clarity',      value: sm.avg_entity_clarity,      key: 'avg_entity_clarity' },
    { label: 'Content Quality',     value: sm.avg_content_quality,     key: 'avg_content_quality' },
    { label: 'Semantic Structure',  value: sm.avg_semantic_structure,  key: 'avg_semantic_structure' },
    { label: 'Entity Richness',     value: sm.avg_entity_richness,     key: 'avg_entity_richness' },
    { label: 'Citation Readiness',  value: sm.avg_citation_readiness,  key: 'avg_citation_readiness' },
    { label: 'Technical SEO',       value: sm.avg_technical_seo,       key: 'avg_technical_seo' },
    { label: 'User Intent',         value: sm.avg_user_intent,         key: 'avg_user_intent' },
    { label: 'Trust Signals',       value: sm.avg_trust_signals,       key: 'avg_trust_signals' },
    { label: 'Authority',           value: sm.avg_authority,           key: 'avg_authority' },
  ] : [];

  // Per-page analysis rows with full scores
  const pageRows = pages.map((p) => {
    const a = analysisMap.get(p.url);
    const avg = a ? avgScores(a) : null;
    const avgPct = avg != null ? avg * 10 : null;
    return `
      <tr>
        <td style="word-break:break-all;font-size:10px;max-width:200px">${p.url}</td>
        <td style="font-size:11px">${p.title ?? '—'}</td>
        <td style="text-align:center;font-weight:700;font-size:14px;color:${metricColor(avgPct)}">${grade(avgPct)}</td>
        <td style="text-align:center">${a ? pct(a.entityClarityScore) : '—'}</td>
        <td style="text-align:center">${a ? pct(a.contentQualityScore) : '—'}</td>
        <td style="text-align:center">${a ? pct(a.semanticStructureScore) : '—'}</td>
        <td style="text-align:center">${a ? pct(a.entityRichnessScore) : '—'}</td>
        <td style="text-align:center">${a ? pct(a.citationReadinessScore) : '—'}</td>
        <td style="text-align:center">${a ? pct(a.technicalSeoScore) : '—'}</td>
        <td style="text-align:center">${a ? pct(a.userIntentAlignmentScore) : '—'}</td>
        <td style="text-align:center">${a ? pct(a.trustSignalsScore) : '—'}</td>
        <td style="text-align:center">${a ? pct(a.authorityScore) : '—'}</td>
        <td style="text-align:center">${a?.wordCount ?? '—'}</td>
      </tr>`;
  }).join('');

  // Score explanations per page
  const explanationsHtml = analyses.map((a) => {
    let expl: Record<string, string> = {};
    try { expl = JSON.parse(a.scoreExplanations ?? '{}'); } catch { /* skip */ }
    const entries = Object.entries(expl);
    if (entries.length === 0) return '';
    return `
      <div style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <div style="background:#f9fafb;padding:8px 12px;font-size:11px;font-weight:600;word-break:break-all;border-bottom:1px solid #e5e7eb">${a.url}</div>
        <div style="padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${entries.map(([k, v]) => `
            <div>
              <div style="font-size:10px;color:#888;font-weight:600;text-transform:uppercase;margin-bottom:2px">${k.replace(/_/g,' ')}</div>
              <div style="font-size:11px;line-height:1.4">${v}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }).filter(Boolean).join('');

  const geoScore = sm?.premium_score ?? crawl.premiumScore;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>GEO Report — ${crawl.baseUrl}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 32px; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  h2 { font-size: 15px; font-weight: 700; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #111; }
  h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #666; margin: 16px 0 8px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
  .grade-badge { display:inline-flex; align-items:center; justify-content:center; font-size:36px; font-weight:800;
    width:72px; height:72px; border-radius:12px; background:#111; color:#fff; margin-right:20px; flex-shrink:0; }
  .summary-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:4px; }
  .summary-box { border:1px solid #e5e7eb; border-radius:8px; padding:12px 14px; }
  .summary-box .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#888; margin-bottom:5px; }
  .summary-box .val { font-size:20px; font-weight:700; }
  .metrics-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 24px; }
  .metric-row { display:flex; flex-direction:column; gap:4px; }
  .metric-row .metric-label { font-size:11px; font-weight:600; display:flex; justify-content:space-between; }
  table { width:100%; border-collapse:collapse; font-size:11px; margin-top:8px; }
  th { background:#f3f4f6; text-align:center; padding:6px 6px; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
  th:first-child, th:nth-child(2) { text-align:left; }
  td { padding:5px 6px; border-bottom:1px solid #f3f4f6; vertical-align:middle; text-align:center; }
  td:first-child, td:nth-child(2) { text-align:left; }
  tr:last-child td { border-bottom:none; }
  tr:nth-child(even) { background:#fafafa; }
  pre { background:#f3f4f6; border-radius:6px; padding:14px; font-size:11px; overflow-x:auto;
    white-space:pre-wrap; word-break:break-all; max-height:320px; overflow-y:auto; line-height:1.5; }
  .rec-section { margin-bottom:4px; }
  @media print {
    body { padding: 20px; }
    pre { max-height:none; }
    h2 { page-break-after: avoid; }
    .metrics-grid, .summary-grid { page-break-inside: avoid; }
    tr { page-break-inside: avoid; }
    .rec-section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- Header -->
<div style="display:flex;align-items:center;margin-bottom:20px">
  ${crawl.overallGrade ? `<div class="grade-badge">${crawl.overallGrade}</div>` : ''}
  <div>
    <h1>${crawl.baseUrl}</h1>
    <div class="meta">GEO Analysis Report &nbsp;·&nbsp; Generated ${generatedAt} &nbsp;·&nbsp; Crawled ${crawlDate}</div>
  </div>
</div>

<!-- Summary -->
<div class="summary-grid">
  <div class="summary-box">
    <div class="lbl">Overall Grade</div>
    <div class="val">${crawl.overallGrade ?? '—'}</div>
  </div>
  <div class="summary-box">
    <div class="lbl">GEO Score</div>
    <div class="val" style="color:${metricColor(geoScore ?? null)}">${geoScore != null ? Math.round(geoScore) + '%' : '—'}</div>
  </div>
  <div class="summary-box">
    <div class="lbl">Pages Crawled</div>
    <div class="val">${crawl.pagesCrawled}</div>
  </div>
  <div class="summary-box">
    <div class="lbl">Pages Analyzed</div>
    <div class="val">${analyses.length}</div>
  </div>
  <div class="summary-box">
    <div class="lbl">Critical Issues</div>
    <div class="val" style="color:${criticalRecs.length > 0 ? '#ef4444' : '#22c55e'}">${criticalRecs.length}</div>
  </div>
</div>

${premiumMetrics.length > 0 ? `
<!-- Premium Metrics -->
<h2>Premium GEO Metrics</h2>
<div class="metrics-grid">
  ${premiumMetrics.map((m) => `
  <div class="metric-row">
    <div class="metric-label">
      <span>${m.label}</span>
    </div>
    ${barHtml(m.value, metricColor(m.value))}
  </div>`).join('')}
</div>
` : ''}

${criticalRecs.length + highRecs.length + mediumRecs.length > 0 ? `
<!-- Recommendations -->
<h2>Critical Issues &amp; Recommendations</h2>

${criticalRecs.length > 0 ? `
<div class="rec-section">
  <h3>🔴 Critical Issues (${criticalRecs.length})</h3>
  ${recsHtml(criticalRecs, '#ef4444', '#fff5f5')}
</div>` : ''}

${highRecs.length > 0 ? `
<div class="rec-section">
  <h3>🟠 High Priority (${highRecs.length})</h3>
  ${recsHtml(highRecs, '#f97316', '#fff8f1')}
</div>` : ''}

${mediumRecs.length > 0 ? `
<div class="rec-section">
  <h3>🟡 Medium Priority (${mediumRecs.length})</h3>
  ${recsHtml(mediumRecs, '#f59e0b', '#fffdf0')}
</div>` : ''}
` : ''}

<!-- Page Analysis Table -->
<h2>Page-by-Page Analysis</h2>
<table>
  <thead>
    <tr>
      <th style="min-width:140px">URL</th>
      <th>Title</th>
      <th>Grade</th>
      <th>Clarity</th>
      <th>Quality</th>
      <th>Semantic</th>
      <th>Richness</th>
      <th>Citation</th>
      <th>Tech SEO</th>
      <th>Intent</th>
      <th>Trust</th>
      <th>Authority</th>
      <th>Words</th>
    </tr>
  </thead>
  <tbody>${pageRows}</tbody>
</table>

${explanationsHtml ? `
<!-- Score Explanations -->
<h2>Score Explanations by Page</h2>
${explanationsHtml}
` : ''}

${crawl.primaryJsonLd ? `
<!-- JSON-LD -->
<h2>JSON-LD Schema Output</h2>
<pre>${crawl.primaryJsonLd.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
` : ''}

${crawl.llmsTxt ? `
<!-- llms.txt -->
<h2>llms.txt Output</h2>
<pre>${crawl.llmsTxt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
` : ''}

</body>
</html>`;
}

export function ReportModal({ crawl, pages, analyses, onClose }: ReportModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = buildReportHtml(crawl, pages, analyses);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleSavePdf() {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-5xl flex flex-col"
        style={{ height: 'calc(100vh - 64px)' }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-text">GEO Analysis Report</div>
            <div className="text-xs text-muted">{crawl.baseUrl}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSavePdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
              Save as PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Report preview */}
        <iframe
          ref={iframeRef}
          className="flex-1 w-full rounded-b-xl bg-white"
          title="GEO Report Preview"
          sandbox="allow-same-origin allow-scripts allow-popups"
        />
      </div>
    </div>
  );
}
