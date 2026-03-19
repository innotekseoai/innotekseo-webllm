/**
 * System prompt and user prompt builder for counter-measure generation.
 *
 * Two modes:
 *  - compact  : 4 sections, no page excerpt — ~200 prompt tokens, fits tiny context windows
 *  - full     : 6 sections, short excerpt   — ~500 prompt tokens, needs ≥1k context headroom
 */

export const COUNTER_MEASURE_SYSTEM =
  `You are an SEO and GEO content strategist. Write a clear, actionable counter-measure document. Use ## markdown headings. Be thorough but concise.`;

export interface CounterMeasureInput {
  issueText: string;
  sourceUrl: string;
  baseUrl: string;
  pageTitle: string | null;
  markdownExcerpt: string;  // caller should pre-truncate: 400 chars (compact) / 800 chars (full)
  affectedMetric: string | null;
  currentScore: number | null;
  /** Compact mode: 4 sections, no excerpt — use for degraded/integrated GPUs */
  compact?: boolean;
}

export function buildCounterMeasurePrompt(input: CounterMeasureInput): string {
  const {
    issueText, sourceUrl, baseUrl, pageTitle,
    markdownExcerpt, affectedMetric, currentScore,
    compact = false,
  } = input;

  const meta: string[] = [`Site: ${baseUrl}`, `Page: ${sourceUrl}`];
  if (pageTitle)      meta.push(`Title: ${pageTitle}`);
  if (affectedMetric) meta.push(`Weakest metric: ${affectedMetric}`);
  if (currentScore !== null) meta.push(`Score: ${currentScore.toFixed(1)}/10`);

  if (compact) {
    // Short prompt (~200 tokens) — no page excerpt
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

  // Full prompt (~500 tokens) — include short page excerpt
  const excerptBlock = markdownExcerpt
    ? `\nPAGE CONTENT SAMPLE:\n${markdownExcerpt}\n`
    : '';

  return `ISSUE: ${issueText}
CONTEXT: ${meta.join(' | ')}
${excerptBlock}
Write a detailed counter-measure document with all six sections fully completed:

## Executive Summary
Overview of the issue and recommended fix (2-3 paragraphs).

## Root Cause Analysis
Technical and content root causes on the target page.

## Step-by-Step Remediation Plan
Numbered list of 6+ concrete, actionable steps.

## Schema and Structured Data
schema.org markup additions or corrections that address the issue.

## Validation and Testing
How to verify the fix using tools and metrics to track.

## Expected Outcomes
Measurable improvements expected after implementing the fix.`;
}
