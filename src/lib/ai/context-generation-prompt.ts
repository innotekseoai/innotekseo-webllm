/**
 * System prompt and user prompt builder for page-specific content generation.
 *
 * Two modes:
 *  - compact : meta description + JSON-LD only — fits small models
 *  - full    : 5 sections (meta, hero, schema, CTA HTML, content improvement)
 */

export const CONTEXT_GENERATION_SYSTEM =
  `You are an SEO and GEO content strategist and web developer. Generate page-specific, implementable content for the given URL. Output must be concrete and copy-paste ready — no placeholders, no generic filler. Use the actual page content and scores to tailor every output. Use ## markdown headings for each section.`;

export interface ContextGenerationInput {
  url: string;
  title: string | null;
  existingDescription: string | null;
  markdownExcerpt: string;   // 800 chars smart-truncated
  pageHeadings: string[];
  scores: Record<string, number>;
  hasExistingSchema: boolean;
  wordCount?: number;
  compact?: boolean;
}

export function buildContextGenerationPrompt(input: ContextGenerationInput): string {
  const {
    url, title, existingDescription, markdownExcerpt,
    pageHeadings, scores, hasExistingSchema, wordCount,
    compact = false,
  } = input;

  const metaLines: string[] = [`URL: ${url}`];
  if (title)               metaLines.push(`TITLE: ${title}`);
  if (existingDescription) metaLines.push(`EXISTING DESCRIPTION: ${existingDescription}`);
  if (wordCount)           metaLines.push(`WORD COUNT: ${wordCount}`);

  const scoresBlock = Object.keys(scores).length > 0
    ? `\nGEO SCORES:\n${Object.entries(scores).map(([k, v]) => `- ${k}: ${v}/10`).join('\n')}\n`
    : '';

  const headingsBlock = pageHeadings.length > 0
    ? `\nPAGE HEADINGS:\n${pageHeadings.map(h => `- ${h}`).join('\n')}\n`
    : '';

  const schemaBlock = `\nSCHEMA STATUS: ${hasExistingSchema ? 'present' : 'none'}\n`;

  const excerptBlock = markdownExcerpt
    ? `\nPAGE CONTENT SAMPLE:\n${markdownExcerpt}\n`
    : '';

  if (compact) {
    return `${metaLines.join('\n')}
${scoresBlock}${headingsBlock}${schemaBlock}${excerptBlock}
Generate the following two sections for ${url}:

## Meta Description
A 150–160 character meta description specific to this page. No filler words. Reference what the page actually offers.

## JSON-LD Schema
Complete schema.org JSON-LD block for this page. Use appropriate @type (Service, AboutPage, ContactPage, WebPage). Include @context, @type, name, description, url. Output only the JSON block inside a \`\`\`json code fence.`;
  }

  return `${metaLines.join('\n')}
${scoresBlock}${headingsBlock}${schemaBlock}${excerptBlock}
Generate all five sections for ${url}:

## Meta Description
A 150–160 character meta description specific to this page. No filler words. Reference what the page actually offers.

## Page Title / Hero Subtitle
A revised H1 or hero subtitle that communicates what this page offers and for whom. Be specific to the content found on the page.

## JSON-LD Schema
Complete schema.org JSON-LD block for this page. Use appropriate @type (Service, AboutPage, ContactPage, WebPage). Include @context, @type, name, description, url. Output only the JSON block inside a \`\`\`json code fence.

## CTA Section (HTML)
A ready-to-paste HTML section for a call-to-action. Include heading, subtext, and two buttons. Match the page topic and reference specific services or content found on the page.

## Key Content Improvement
One specific paragraph or list block to add or rewrite on this page. Reference the actual current headings or content to explain what changes and why it improves GEO scores.`;
}
