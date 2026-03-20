/**
 * System prompt and user prompt builder for counter-measure generation.
 *
 * Two modes:
 *  - compact  : 4 sections, no page excerpt — ~200 prompt tokens, fits tiny context windows
 *  - full     : 7 sections, scores table + headings + excerpt — ~700 prompt tokens, needs ≥1k context headroom
 */

export const COUNTER_MEASURE_SYSTEM =
  `You are an SEO and GEO content strategist and web developer. Write a precise, page-specific counter-measure document. Reference the exact page URL and its actual content in every section. Output concrete code snippets (JSON-LD, HTML, meta tags) where relevant. Frame every remediation step so it can be executed directly by an automated agent with no further interpretation. Use ## markdown headings.`;

export interface CounterMeasureInput {
  issueText: string;
  sourceUrl: string;
  baseUrl: string;
  pageTitle: string | null;
  markdownExcerpt: string;  // caller should pre-truncate: 0 chars (compact) / 800 chars (full)
  affectedMetric: string | null;
  currentScore: number | null;
  /** All 9 GEO metric scores keyed by display name */
  allScores?: Record<string, number>;
  /** h1–h3 lines extracted from page markdown */
  pageHeadings?: string[];
  /** Whether the page already has JSON-LD schema */
  hasExistingSchema?: boolean;
  wordCount?: number;
  /** Compact mode: 4 sections, no excerpt — use for degraded/integrated GPUs */
  compact?: boolean;
}

export function buildCounterMeasurePrompt(input: CounterMeasureInput): string {
  const {
    issueText, sourceUrl, baseUrl, pageTitle,
    markdownExcerpt, affectedMetric, currentScore,
    allScores, pageHeadings, hasExistingSchema, wordCount,
    compact = false,
  } = input;

  if (compact) {
    // Short prompt (~200 tokens) — no page excerpt
    const meta: string[] = [`Site: ${baseUrl}`, `Page: ${sourceUrl}`];
    if (pageTitle)      meta.push(`Title: ${pageTitle}`);
    if (affectedMetric) meta.push(`Weakest metric: ${affectedMetric}`);
    if (currentScore !== null) meta.push(`Score: ${currentScore.toFixed(1)}/10`);

    return `ISSUE: ${issueText}
CONTEXT: ${meta.join(' | ')}

Write a concise counter-measure with exactly these four sections:

## Summary
What the issue is and the recommended fix (2-3 sentences).

## Root Cause
Why this issue exists on the page (3-5 sentences).

## Remediation Steps
Numbered list of 4-5 concrete action steps to fix this issue.

## Expected Outcome
Measurable improvements after implementing the fix (2-3 sentences).`;
  }

  // Full prompt (~700 tokens) — include scores table, headings, and page excerpt
  const scoresBlock = allScores
    ? `\nGEO SCORES:\n${Object.entries(allScores)
        .map(([k, v]) => `- ${k}: ${v}/10`)
        .join('\n')}${affectedMetric ? `\nWeakest: ${affectedMetric}` : ''}\n`
    : (affectedMetric ? `\nWeakest metric: ${affectedMetric}${currentScore !== null ? ` (${currentScore.toFixed(1)}/10)` : ''}\n` : '');

  const headingsBlock = pageHeadings && pageHeadings.length > 0
    ? `\nHEADINGS FOUND ON PAGE:\n${pageHeadings.map(h => `- ${h}`).join('\n')}\n`
    : '';

  const schemaBlock = hasExistingSchema !== undefined
    ? `\nSCHEMA STATUS: ${hasExistingSchema ? 'present' : 'none'}\n`
    : '';

  const excerptBlock = markdownExcerpt
    ? `\nPAGE CONTENT SAMPLE:\n${markdownExcerpt}\n`
    : '';

  const metaLines: string[] = [
    `ISSUE: ${issueText}`,
    `PAGE: ${sourceUrl}`,
    `SITE: ${baseUrl}`,
  ];
  if (pageTitle)   metaLines.push(`TITLE: ${pageTitle}`);
  if (wordCount)   metaLines.push(`WORD COUNT: ${wordCount}`);

  return `${metaLines.join('\n')}
${scoresBlock}${headingsBlock}${schemaBlock}${excerptBlock}
Write a detailed counter-measure document with all seven sections fully completed:

## Executive Summary
Describe the issue as it appears on ${sourceUrl}. Reference at least one specific heading or element found on the page.

## Root Cause Analysis
Identify why this specific page has this issue. Reference its actual content, score data, and missing elements.

## Step-by-Step Remediation Plan
Numbered list of 6+ steps. EACH step must:
- Name the exact element, attribute, or code block to change
- Include a code snippet (HTML, JSON-LD, or meta tag) where applicable
- Be executable by an automated agent without further clarification

## Schema and Structured Data
Provide the exact JSON-LD block to add or update for ${sourceUrl}.
Include @context, @type, name, description, url and any relevant @id references.

## Agentic Implementation Notes
List the specific file(s) to edit (infer from URL structure if Astro/CMS-style path is recognisable), the exact code to insert or replace, and the git-friendly change description.

## Validation and Testing
Tools and checks to verify the fix on ${sourceUrl} specifically.

## Expected Outcomes
Measurable score improvements expected on the affected GEO metrics.`;
}
