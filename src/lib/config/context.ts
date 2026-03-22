/**
 * Context profile configuration
 *
 * Controls truncation limits, token budgets, and timeouts across the
 * crawler analyser, page analyser, and counter-measure generator.
 *
 * Standard  — current tuned values, works on all discrete GPUs
 * Large     — 50% larger context/token budgets for 7B+ models on 8GB+ VRAM
 *
 * Profile is stored in localStorage. When no override is set, the profile
 * auto-selects based on the currently loaded model (xl-tagged → large).
 */

export type ContextProfile = 'standard' | 'large';

export interface ContextConfig {
  /** Characters sent to GEO analyser (smartTruncate limit) */
  analyzerTruncate: number;

  /** Page Analyser — markdown excerpt chars */
  pageAnalyserExcerptCompact: number;
  pageAnalyserExcerptFull: number;

  /** Page Analyser — max output tokens */
  pageAnalyserTokensCompact: number;
  pageAnalyserTokensFull: number;

  /** Page Analyser — inference timeout ms */
  pageAnalyserTimeoutCompact: number;
  pageAnalyserTimeoutFull: number;

  /** Counter-Measure — max output tokens */
  counterMeasureTokensCompact: number;
  counterMeasureTokensFull: number;

  /** Counter-Measure — markdown excerpt chars */
  counterMeasureExcerptCompact: number;
  counterMeasureExcerptFull: number;

  /** Counter-Measure — inference timeout ms */
  counterMeasureTimeoutCompact: number;
  counterMeasureTimeoutFull: number;
}

export const CONTEXT_CONFIG: Record<ContextProfile, ContextConfig> = {
  standard: {
    analyzerTruncate:              6_000,

    pageAnalyserExcerptCompact:    3_000,
    pageAnalyserExcerptFull:       8_000,
    pageAnalyserTokensCompact:       768,
    pageAnalyserTokensFull:        2_500,
    pageAnalyserTimeoutCompact:   60_000,
    pageAnalyserTimeoutFull:     180_000,

    counterMeasureTokensCompact:     512,
    counterMeasureTokensFull:      2_000,
    counterMeasureExcerptCompact:      0,
    counterMeasureExcerptFull:     2_500,
    counterMeasureTimeoutCompact: 45_000,
    counterMeasureTimeoutFull:   180_000,
  },

  large: {
    analyzerTruncate:              9_000,  // +50%

    pageAnalyserExcerptCompact:    4_500,  // +50%
    pageAnalyserExcerptFull:      12_000,  // +50%
    pageAnalyserTokensCompact:     1_152,  // +50%
    pageAnalyserTokensFull:        3_750,  // +50%
    pageAnalyserTimeoutCompact:   90_000,  // +50%
    pageAnalyserTimeoutFull:     270_000,  // +50%

    counterMeasureTokensCompact:     768,  // +50%
    counterMeasureTokensFull:      3_000,  // +50%
    counterMeasureExcerptCompact:  1_500,  // compact now gets content
    counterMeasureExcerptFull:     3_750,  // +50%
    counterMeasureTimeoutCompact: 68_000,  // +50%
    counterMeasureTimeoutFull:   270_000,  // +50%
  },
};

const STORAGE_KEY = 'contextProfileOverride';

export function readContextProfileOverride(): ContextProfile | null {
  try {
    const v = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return v === 'standard' || v === 'large' ? v : null;
  } catch { return null; }
}

export function writeContextProfileOverride(profile: ContextProfile | null): void {
  try {
    if (profile) localStorage.setItem(STORAGE_KEY, profile);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
