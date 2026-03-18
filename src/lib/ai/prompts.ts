/**
 * Prompt templates for local AI GEO analysis
 *
 * Designed for small models (0.5B-1.5B params via WebLLM).
 * Asks for simple CSV-style scores, not full JSON — we parse into structure.
 * For scores ≤ 4, requests a pipe-separated explanation.
 */

import { generateRichJsonLd } from './schema-generator.js';

export const SYSTEM_PROMPT =
  'You are a GEO scoring assistant. Reply with scores only. For scores 4 or below, add a brief reason after a pipe character.';

export function buildGeoAnalysisPrompt(input: {
  url: string;
  markdown: string;
  baseUrl: string;
}): string {
  return `Rate this webpage on 10 metrics (1-10 scale). Also count verifiable facts (numbers, dates, stats) and total words.

URL: ${input.url}

Reply in EXACTLY this format (one value per line):
entity_clarity: <score> | <reason if score<=4>
facts: <count>
words: <count>
content_quality: <score> | <reason if score<=4>
semantic_structure: <score> | <reason if score<=4>
entity_richness: <score> | <reason if score<=4>
citation_readiness: <score> | <reason if score<=4>
technical_seo: <score> | <reason if score<=4>
user_intent: <score> | <reason if score<=4>
trust_signals: <score> | <reason if score<=4>
authority: <score> | <reason if score<=4>
summary: <one line summary for llms.txt>
rec1: [high|medium|low] <specific improvement>
rec2: [high|medium|low] <specific improvement>
rec3: [high|medium|low] <specific improvement>

PAGE CONTENT:
${input.markdown}`;
}

/**
 * Parse the simple score format into a GeoPageAnalysis-compatible object.
 * Much more reliable than asking tiny models to produce JSON.
 * Now also extracts pipe-separated explanations for low scores.
 * Uses generateRichJsonLd for type-specific JSON-LD schemas.
 */
export function parseScoreResponse(raw: string, url: string, markdown: string, schemaType = 'WebPage'): Record<string, unknown> | null {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  function extractNumberAndReason(key: string): { value: number | null; reason: string | null } {
    for (const line of lines) {
      const match = line.match(new RegExp(`${key}[:\\s]+([\\d.]+)(?:\\s*\\|\\s*(.+))?`, 'i'));
      if (match) {
        const val = parseFloat(match[1]);
        if (!isNaN(val)) {
          return { value: val, reason: match[2]?.trim() || null };
        }
      }
    }
    return { value: null, reason: null };
  }

  function extractNumber(key: string): number | null {
    return extractNumberAndReason(key).value;
  }

  function extractText(key: string): string | null {
    for (const line of lines) {
      const match = line.match(new RegExp(`${key}[:\\s]+(.+)`, 'i'));
      if (match) {
        const text = match[1].trim();
        // Skip if the "text" is just a number (model confused the field)
        if (/^\d+$/.test(text)) return null;
        return text;
      }
    }
    return null;
  }

  // Flexible patterns — match "Entity Clarity", "entity_clarity", "EntityClarity"
  const entityClarity = extractNumberAndReason('entity[_ ]?clarity');
  const contentQuality = extractNumberAndReason('content[_ ]?quality');
  const semanticStructure = extractNumberAndReason('semantic[_ ]?structure');
  const entityRichness = extractNumberAndReason('entity[_ ]?richness');
  const citationReadiness = extractNumberAndReason('citation[_ ]?readiness');
  const technicalSeo = extractNumberAndReason('technical[_ ]?seo');
  const userIntent = extractNumberAndReason('user[_ ]?intent');
  const trustSignals = extractNumberAndReason('trust[_ ]?signals?');
  const authority = extractNumberAndReason('authority');

  const facts = extractNumber('facts?');
  const words = extractNumber('words?');
  const summary = extractText('summary');

  // Parse up to 3 recommendations with impact levels
  const recommendations: string[] = [];
  for (const key of ['rec1', 'rec2', 'rec3', 'recommendation']) {
    const rec = extractText(key);
    if (rec) recommendations.push(rec);
  }

  // Need at least a few scores to consider it valid
  const scoreEntries = [entityClarity, contentQuality, semanticStructure, entityRichness,
    citationReadiness, technicalSeo, userIntent, trustSignals, authority];
  const validScores = scoreEntries.filter(s => s.value !== null);
  if (validScores.length < 3) return null;

  // Build explanations map for low scores
  const score_explanations: Record<string, string> = {};
  const scoreMap: Array<[string, { value: number | null; reason: string | null }]> = [
    ['entity_clarity', entityClarity],
    ['content_quality', contentQuality],
    ['semantic_structure', semanticStructure],
    ['entity_richness', entityRichness],
    ['citation_readiness', citationReadiness],
    ['technical_seo', technicalSeo],
    ['user_intent', userIntent],
    ['trust_signals', trustSignals],
    ['authority', authority],
  ];
  for (const [name, entry] of scoreMap) {
    if (entry.reason && entry.value !== null && entry.value <= 4) {
      score_explanations[name] = entry.reason;
    }
  }

  const path = (() => {
    try { return new URL(url).pathname; } catch { return url; }
  })();

  // Generate rich type-specific JSON-LD
  const jsonLd = generateRichJsonLd({ url, markdown });

  return {
    _parsedScoreCount: validScores.length,
    json_ld: jsonLd,
    llms_txt_entry: summary
      ? `- [${summary.slice(0, 60)}](${path}): ${summary}`
      : `- [Page](${path}): Content page`,
    entity_clarity_score: entityClarity.value ?? 5,
    fact_density_count: facts ?? 0,
    word_count: words ?? markdown.split(/\s+/).length,
    content_quality_score: contentQuality.value ?? 5,
    semantic_structure_score: semanticStructure.value ?? 5,
    entity_richness_score: entityRichness.value ?? 5,
    citation_readiness_score: citationReadiness.value ?? 5,
    technical_seo_score: technicalSeo.value ?? 5,
    user_intent_alignment_score: userIntent.value ?? 5,
    trust_signals_score: trustSignals.value ?? 5,
    authority_score: authority.value ?? 5,
    geo_recommendations: recommendations,
    score_explanations: Object.keys(score_explanations).length > 0 ? score_explanations : undefined,
  };
}

// Keep for backward compatibility but no longer used for grammar enforcement
export const GEO_JSON_SCHEMA = {};
