/**
 * Heuristic Schema.org type detection
 *
 * Classifies pages by URL path patterns and content signals
 * to generate appropriate @type in JSON-LD instead of hardcoded "WebPage".
 */

type SchemaType = 'Article' | 'Product' | 'Organization' | 'FAQPage' | 'WebSite' | 'WebPage'
  | 'ContactPage' | 'AboutPage' | 'CollectionPage';

interface DetectionInput {
  url: string;
  markdown: string;
  title?: string;
}

const PATH_PATTERNS: Array<{ pattern: RegExp; type: SchemaType }> = [
  { pattern: /\/(blog|news|article|post|journal)\//i, type: 'Article' },
  { pattern: /\/\d{4}\/\d{2}\//, type: 'Article' }, // date-based paths like /2024/03/
  { pattern: /\/(product|shop|store|item)\//i, type: 'Product' },
  { pattern: /\/(faq|frequently-asked|help\/faq)/i, type: 'FAQPage' },
  { pattern: /\/(about|about-us|who-we-are|our-story)/i, type: 'AboutPage' },
  { pattern: /\/(contact|contact-us|get-in-touch)/i, type: 'ContactPage' },
  { pattern: /\/(category|tag|archive|collection)/i, type: 'CollectionPage' },
];

const CONTENT_PATTERNS: Array<{ pattern: RegExp; type: SchemaType; weight: number; minMatches?: number }> = [
  // FAQ patterns — require at least 2 question headings to avoid false positives
  { pattern: /\?\s*\n/g, type: 'FAQPage', weight: 3, minMatches: 2 },
  { pattern: /^#{1,3}\s+.*\?/gm, type: 'FAQPage', weight: 5, minMatches: 2 },
  // Product patterns
  { pattern: /\$\d+[\d,.]*|\bprice\b|\badd to cart\b|\bbuy now\b/gi, type: 'Product', weight: 2 },
  // Article patterns
  { pattern: /^#{1,2}\s+/gm, type: 'Article', weight: 1 },
  { pattern: /\bpublished\b|\bauthor\b|\bwritten by\b/gi, type: 'Article', weight: 3 },
  // Organization patterns
  { pattern: /\bour team\b|\bour mission\b|\bfounded\b|\bheadquarters\b/gi, type: 'Organization', weight: 3 },
];

/**
 * Detect the most likely Schema.org type for a page.
 */
export function detectSchemaType(input: DetectionInput): SchemaType {
  const { url, markdown } = input;

  try {
    const parsedUrl = new URL(url);

    // Homepage → WebSite
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') {
      return 'WebSite';
    }

    // URL path pattern matching (highest confidence)
    for (const { pattern, type } of PATH_PATTERNS) {
      if (pattern.test(parsedUrl.pathname)) {
        return type;
      }
    }
  } catch { /* invalid URL, fall through to content analysis */ }

  // Content pattern scoring
  const scores = new Map<SchemaType, number>();
  for (const { pattern, type, weight, minMatches = 1 } of CONTENT_PATTERNS) {
    const matches = markdown.match(pattern);
    if (matches && matches.length >= minMatches) {
      scores.set(type, (scores.get(type) ?? 0) + matches.length * weight);
    }
  }

  // Find highest scoring type
  let bestType: SchemaType = 'WebPage';
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // Require minimum confidence threshold
  return bestScore >= 6 ? bestType : 'WebPage';
}
