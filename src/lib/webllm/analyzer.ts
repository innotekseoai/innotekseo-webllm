/**
 * Browser-side GEO page analyzer using WebLLM
 *
 * Uses the same prompt templates and parsing logic as v3,
 * but runs inference through WebLLM instead of llama-server.
 */

import { chatCompletion, type InferenceCallbacks, type InferenceStats } from './engine.js';
import { SYSTEM_PROMPT, buildGeoAnalysisPrompt, parseScoreResponse } from '../ai/prompts.js';
import { smartTruncate } from '../ai/truncate.js';
import { safeJsonParse } from '../ai/json-repair.js';
import type { GeoPageAnalysis } from '../../types/analysis.js';
import { GeoPageAnalysisSchema } from '../../types/analysis.js';

export type { InferenceStats };

interface AnalyzePageInput {
  url: string;
  markdown: string;
  baseUrl: string;
  onProgress?: (message: string) => void;
  /** Called with each token as the model generates */
  onToken?: (token: string, partialText: string) => void;
  /** Called when inference completes with stats */
  onStats?: (stats: InferenceStats) => void;
}

/**
 * Analyze a single page for GEO metrics using WebLLM.
 *
 * Uses 3-strategy parsing (same as v3):
 * 1. Score-line regex parsing (most reliable for small models)
 * 2. JSON parse attempt
 * 3. Number extraction fallback
 */
export async function analyzePageForGeo(input: AnalyzePageInput): Promise<GeoPageAnalysis> {
  const { url, markdown, baseUrl, onProgress, onToken, onStats } = input;

  const truncated = smartTruncate(markdown, 4000);
  const prompt = buildGeoAnalysisPrompt({ url, markdown: truncated, baseUrl });

  onProgress?.(`Analyzing: ${url}`);

  let raw: string;
  try {
    raw = await chatCompletion(SYSTEM_PROMPT, prompt, { onToken, onStats });
  } catch (err) {
    onProgress?.(`Inference failed for ${url}: ${err instanceof Error ? err.message : 'unknown'}`);
    throw err;
  }

  if (!raw || raw.trim().length < 10) {
    onProgress?.(`Empty response for: ${url}`);
    return buildDefaultResult({}, url, markdown);
  }

  // Strategy 1: Score-line regex parsing (primary)
  const parsed = parseScoreResponse(raw, url, markdown);
  if (parsed) {
    const validated = GeoPageAnalysisSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    return buildDefaultResult(parsed, url, markdown);
  }

  // Strategy 2: Try JSON parse
  const jsonParsed = safeJsonParse(raw);
  if (jsonParsed && typeof jsonParsed === 'object') {
    const validated = GeoPageAnalysisSchema.safeParse(jsonParsed);
    if (validated.success) {
      return validated.data;
    }
  }

  // Strategy 3: Default result
  onProgress?.(`Using defaults for: ${url}`);
  return buildDefaultResult({}, url, markdown);
}

function buildDefaultResult(
  partial: Record<string, unknown>,
  url: string,
  markdown: string,
): GeoPageAnalysis {
  const path = (() => {
    try { return new URL(url).pathname; } catch { return url; }
  })();

  const wordCount = markdown.split(/\s+/).length;

  return {
    json_ld: (partial.json_ld as string) ?? JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: markdown.split('\n')[0]?.replace(/^#\s*/, '').slice(0, 100) || 'Page',
      url,
    }),
    llms_txt_entry: (partial.llms_txt_entry as string) ?? `- [Page](${path}): Content page`,
    entity_clarity_score: clampScore(partial.entity_clarity_score) ?? 5,
    fact_density_count: (partial.fact_density_count as number) ?? 0,
    word_count: (partial.word_count as number) ?? wordCount,
    content_quality_score: clampScore(partial.content_quality_score) ?? 5,
    semantic_structure_score: clampScore(partial.semantic_structure_score) ?? 5,
    entity_richness_score: clampScore(partial.entity_richness_score) ?? 5,
    citation_readiness_score: clampScore(partial.citation_readiness_score) ?? 5,
    technical_seo_score: clampScore(partial.technical_seo_score) ?? 5,
    user_intent_alignment_score: clampScore(partial.user_intent_alignment_score) ?? 5,
    trust_signals_score: clampScore(partial.trust_signals_score) ?? 5,
    authority_score: clampScore(partial.authority_score) ?? 5,
    geo_recommendations: (partial.geo_recommendations as string[]) ?? [],
    score_explanations: partial.score_explanations as Record<string, string> | undefined,
  };
}

function clampScore(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  return Math.max(1, Math.min(10, Math.round(value)));
}
