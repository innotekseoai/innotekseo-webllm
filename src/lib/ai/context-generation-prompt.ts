/**
 * System prompt and user prompt builder for page-specific content generation.
 *
 * Two modes:
 *  - compact : meta description + JSON-LD only — fits small models
 *  - full    : 5 sections (meta, hero, schema, CTA HTML, content improvement)
 */

export const CONTEXT_GENERATION_SYSTEM =
  `You are an SEO and GEO content strategist and web developer. Generate page-specific, implementable content for the given URL.

RULES:
- Every output must be grounded in the FULL PAGE STRUCTURE and PAGE CONTENT SAMPLE provided below.
- Do NOT use the site homepage title or brand tagline as a page-level heading. The H1 must describe what THIS page specifically offers.
- Do NOT suggest adding content or sections that are already listed in the FULL PAGE STRUCTURE — check the heading list before suggesting new content.
- Do NOT invent image paths. Only use paths from the IMAGES ON THIS PAGE list. If that list says "none found", omit image fields entirely.
- Do NOT reference content, sections, or services that are not present on this page.
- Use <a href="..."> links, not <button> elements, for calls to action.
- Output must be copy-paste ready — no placeholders, no generic filler.
- Use ## markdown headings for each section.`;

export interface ContextGenerationInput {
  url: string;
  title: string | null;
  existingDescription: string | null;
  markdownExcerpt: string;
  pageHeadings: string[];
  scores: Record<string, number>;
  existingJsonLd: string | null;
  knownPaths?: string[];
  imagePaths?: string[];
  wordCount?: number;
  compact?: boolean;
}

export function buildContextGenerationPrompt(input: ContextGenerationInput): string {
  const {
    url, title, existingDescription, markdownExcerpt,
    pageHeadings, scores, existingJsonLd, knownPaths,
    imagePaths, wordCount, compact = false,
  } = input;

  const metaLines: string[] = [`URL: ${url}`];
  if (title)               metaLines.push(`TITLE: ${title}`);
  if (existingDescription) metaLines.push(`EXISTING DESCRIPTION (improve this): ${existingDescription}`);
  if (wordCount)           metaLines.push(`WORD COUNT: ${wordCount}`);

  const scoresBlock = Object.keys(scores).length > 0
    ? `\nGEO SCORES:\n${Object.entries(scores).map(([k, v]) => `- ${k}: ${v}/10`).join('\n')}\n`
    : '';

  const headingsBlock = pageHeadings.length > 0
    ? `\nFULL PAGE STRUCTURE — all headings in document order (this is the complete section list, do NOT suggest adding sections that already appear here):\n${pageHeadings.map(h => `- ${h}`).join('\n')}\n`
    : '';

  const imagesBlock = imagePaths && imagePaths.length > 0
    ? `\nIMAGES ON THIS PAGE (use ONLY these paths in any schema image field — no invented paths):\n${imagePaths.map(p => `- ${p}`).join('\n')}\n`
    : `\nIMAGES ON THIS PAGE: none found — do NOT invent any image paths.\n`;

  const schemaBlock = existingJsonLd
    ? `\nEXISTING JSON-LD (improve only — keep ALL existing fields, never remove any):\n\`\`\`json\n${existingJsonLd}\n\`\`\`\n`
    : `\nSCHEMA STATUS: none\n`;

  const pathsBlock = knownPaths && knownPaths.length > 0
    ? `\nKNOWN SITE PATHS (use ONLY these for any hrefs or urls — no invented paths):\n${knownPaths.slice(0, 20).map(p => `- ${p}`).join('\n')}\n`
    : '';

  const excerptBlock = markdownExcerpt
    ? `\nPAGE CONTENT SAMPLE:\n${markdownExcerpt}\n`
    : '';

  if (compact) {
    return `${metaLines.join('\n')}
${scoresBlock}${headingsBlock}${imagesBlock}${schemaBlock}${pathsBlock}${excerptBlock}
Generate the following two sections for ${url}. Use only what is in the page content above — no invented details.

## Meta Description
A 150–160 character meta description. Must reference the specific service/topic of this page (see PAGE HEADINGS). Improve the EXISTING DESCRIPTION if provided. No CTAs like "Free consultation".

## JSON-LD Schema
Improve the EXISTING JSON-LD above if present, or create a new schema. Use @type appropriate for this page (Service for service pages, AboutPage, ContactPage, etc.). Keep all existing useful fields (serviceType, provider, areaServed, image). Ensure the url field uses the exact URL above with its trailing slash. Output only the JSON inside a \`\`\`json code fence.`;
  }

  return `${metaLines.join('\n')}
${scoresBlock}${headingsBlock}${imagesBlock}${schemaBlock}${pathsBlock}${excerptBlock}
Generate all five sections for ${url}. Base every output on the PAGE HEADINGS and PAGE CONTENT SAMPLE above. Do not use the site homepage title.

## Meta Description
A 150–160 character meta description. Must reference the specific service/topic of this page. Improve the EXISTING DESCRIPTION if provided. No generic CTAs.

## Page Title / Hero Subtitle
A revised H1 or hero subtitle specific to this page's topic. Must differ from any other page. Derived from the PAGE HEADINGS listed above, not the site brand tagline.

## JSON-LD Schema
Improve the EXISTING JSON-LD if present. Keep all valuable fields (serviceType, provider, areaServed, image if present). Ensure url matches the exact URL above with trailing slash. Use @type matching the page topic. Output only the JSON inside a \`\`\`json code fence.

## CTA Section (HTML)
A ready-to-paste HTML snippet with a heading, one sentence of subtext, and two <a href="..."> links styled as buttons. Match the page topic and use content from this page. Do not use <button> elements. Do not invent URLs — use only paths that exist on this site.

## Key Content Improvement
One specific paragraph or bullet list to add or rewrite on this page, grounded in the PAGE HEADINGS and content above. Explain which heading it belongs under and why it improves GEO scores.`;
}
