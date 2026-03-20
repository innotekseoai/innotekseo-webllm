# CLAUDE.md

Fully client-side web crawler + browser GPU AI (GEO analysis). Static Next.js export — no server. Crawls via CORS proxy → markdown → WebGPU LLM inference → IndexedDB storage.

## Commands

```bash
npm run dev      # Next.js dev server
npm run build    # Static export (output: 'export')
```

## Critical Limits (most likely to need changing)

| Setting | Value | File:Location |
|---------|-------|---------------|
| Markdown truncation sent to LLM | **1200 chars** | `src/lib/webllm/analyzer.ts:39` |
| Max completion tokens | **400** | `src/lib/webllm/engine.ts:261` |
| Inference timeout | **30s** | `src/lib/webllm/engine.ts:217` |
| Crawl concurrency | **2** parallel | `src/lib/crawler/web-client.ts:194` |
| Rate limit delay | **300ms** | `src/lib/crawler/web-client.ts:193` |
| Per-proxy fetch timeout | **15s** | `src/lib/crawler/web-client.ts:48` |
| CORS proxy failover threshold | **2 failures** | `src/lib/crawler/web-client.ts:138` |
| Analysis circuit breaker | **2 consecutive GPU fails** | `src/hooks/useCrawler.ts:195` |
| smartTruncate default limit | **2000 chars** | `src/lib/ai/truncate.ts:103` |

> **Note:** 1200 chars ≈ ~300 tokens — very small. Models support 2k-4k context. Increasing to 3000-6000 chars can significantly improve analysis quality for content-heavy pages.

## Data Flow

```
User URL → useCrawler.executeCrawl()
  │
  ├─ [Phase 1: Crawl] crawlFromBrowser()
  │    ├─ BFS queue, 2 parallel (p-limit)
  │    ├─ CORS proxy (3-proxy cycling failover)
  │    ├─ DOMParser → Readability → Turndown → markdown
  │    ├─ discoverLinks() same-domain filter
  │    └─ Dexie: insert crawlPages (markdown inline)
  │
  └─ [Phase 2: Analysis] per-page loop
       ├─ smartTruncate(markdown, 1200) — heading-priority section selection
       ├─ buildGeoAnalysisPrompt(url, truncated) — CSV-format prompt
       ├─ chatCompletion(systemPrompt, userPrompt) — WebGPU, stream=true
       ├─ parseScoreResponse() — regex → JSON → defaults (3-strategy)
       ├─ Dexie: insert pageAnalyses
       └─ aggregateResults() → grade + metrics → update crawl record
```

## AI Prompt Format

**System prompt:** `"You are a GEO scoring assistant. Reply with scores only. For scores 4 or below, add a brief reason after a pipe character."`

**User prompt (CSV-style, not JSON):**
```
entity_clarity: <1-10> | <reason if ≤4>
facts: <count>
words: <count>
content_quality: <1-10> | <reason if ≤4>
semantic_structure: <1-10> | <reason if ≤4>
entity_richness: <1-10> | <reason if ≤4>
citation_readiness: <1-10> | <reason if ≤4>
technical_seo: <1-10> | <reason if ≤4>
user_intent: <1-10> | <reason if ≤4>
trust_signals: <1-10> | <reason if ≤4>
authority: <1-10> | <reason if ≤4>
summary: <one line for llms.txt>
rec1: [high|medium|low] <specific improvement>
rec2: [high|medium|low] <specific improvement>
rec3: [high|medium|low] <specific improvement>

PAGE CONTENT:
<truncated markdown>
```

Parsing: regex (primary) → JSON fallback → hardcoded defaults. See `src/lib/webllm/analyzer.ts:57-78`.

## smartTruncate Algorithm (`src/lib/ai/truncate.ts`)

1. Split markdown by `^#{1,3}` headings into sections
2. Score sections: intro=4, high-priority keywords=3 (about/services/pricing/faq/features), medium=2 (team/blog/partners), other=1
3. Greedily include by priority until char budget exhausted
4. Truncate last section at sentence boundary (`. `) — requires match after 40% of target
5. Re-sort to original document order, append `[truncated]`

## Key File Map

| Purpose | File |
|---------|------|
| Crawler (fetch+parse) | `src/lib/crawler/web-client.ts` |
| Link discovery | `src/lib/crawler/link-discovery.ts` |
| WebLLM engine singleton | `src/lib/webllm/engine.ts` |
| Page analyzer | `src/lib/webllm/analyzer.ts` |
| Prompt builder | `src/lib/ai/prompts.ts` |
| Smart truncation | `src/lib/ai/truncate.ts` |
| JSON-LD schema gen | `src/lib/ai/schema-generator.ts` |
| Schema type detection | `src/lib/ai/schema-detect.ts` |
| Recommendations | `src/lib/ai/recommendations.ts` |
| Grading + aggregation | `src/lib/analysis/engine.ts` |
| IndexedDB client | `src/lib/db/dexie-client.ts` |
| Export (JSON/CSV) | `src/lib/export/client-export.ts` |
| Crawl+analyze orchestration | `src/hooks/useCrawler.ts` |
| Model lifecycle hook | `src/hooks/useWebLLM.ts` |
| DB query hooks | `src/hooks/useDb.ts` |
| Zod schemas | `src/types/analysis.ts` |

## Database Schema (Dexie / IndexedDB)

**crawls**: `crawlId, baseUrl, status, pagesCrawled, pageLimit, grade, metrics(JSON), timestamps`
**crawlPages**: `crawlId, url, title, description, markdown(inline!), charCount, status`
**pageAnalyses**: `crawlId, url, 9×scores, facts, words, jsonLd, llmsTxtEntry, recommendations(JSON[]), scoreExplanations(JSON)`

## GeoPageAnalysis Output Schema (`src/types/analysis.ts`)

9 scores (1-10): `entity_clarity`, `content_quality`, `semantic_structure`, `entity_richness`, `citation_readiness`, `technical_seo`, `user_intent_alignment`, `trust_signals`, `authority`
Plus: `fact_density_count`, `word_count`, `json_ld`, `llms_txt_entry`, `geo_recommendations[]`, `confidence_score`, `score_explanations`

Grade computed from: `entity_clarity + avg_words_per_fact + schema_completeness → A/B/C/D/F`

## Available Models (`src/lib/webllm/engine.ts:23-105`)

| Size | Model | Download | VRAM | Notes |
|------|-------|----------|------|-------|
| Tiny | SmolLM2 135M q0f16 | ~140MB | 360MB | fastest |
| Tiny | SmolLM2 360M q4f16 | ~200MB | 376MB | |
| Small | Qwen2.5 0.5B q4f16 | ~350MB | 945MB | |
| Small | Llama 3.2 1B q4f16 | ~600MB | 879MB | |
| **Medium** | **Qwen2.5 1.5B q4f16** | ~900MB | 1630MB | **recommended** |
| Medium | SmolLM2 1.7B q4f16 | ~1GB | 1774MB | |
| Large | Llama 3.2 3B q4f16 | ~1.8GB | 2264MB | |
| Large | Phi 3.5 Mini | ~2GB | 2520MB | **1k ctx limit** |

Models cached in Cache Storage by WebLLM runtime. Download-only mode loads+unloads immediately (weights persist).

## CORS Proxies (`src/lib/crawler/web-client.ts:33-37`)

1. `https://api.allorigins.win/raw?url=`
2. `https://corsproxy.io/?url=`
3. `https://api.codetabs.com/v1/proxy?quest=`

Adaptive: fails over after 2 consecutive failures, resets streak on success. User-configured proxies prepended (stored in localStorage).

## Counter-Measure Feature (`/counter-measure`)

Generates AI remediation documents for critical issues found during crawls.

**Prompt file:** `src/lib/ai/counter-measure-prompt.ts`
**Page:** `src/app/counter-measure/page.tsx`

Two modes auto-selected by GPU tier (manual override toggle available):

| Mode | Sections | Excerpt | Max tokens | Timeout |
|------|----------|---------|------------|---------|
| **Compact** (integrated/software GPU) | 4 | none | 512 | 45s |
| **Full** (discrete GPU) | 6 | 800 chars | 800 | 75s |

GPU tier detection: `webllm.gpuInfo?.tier === 'integrated' \| 'software'` → auto-compact.

Partial output is preserved on timeout/GPU error (if >80 chars) instead of showing error screen.

Deep-link: `/counter-measure?crawlId=N&issueIndex=N&type=critical`

Issue sources (via `useCompletedCrawlsWithIssues` hook):
- **Site-level**: from `siteMetrics.critical_issues[]` on the crawl record
- **Page-level**: recs with `priority === 'critical'` from `pageAnalyses.geoRecommendations`

Output actions: copy to clipboard, save as PDF (print dialog via `window.open()` + `window.print()`).

## Report Modal (`src/components/crawl/report-modal.tsx`)

Full-crawl HTML report rendered in a sandboxed iframe. Includes:
- Grade badge + summary grid (GEO score, pages crawled/analyzed, critical issue count)
- Premium metrics bars (9 scores as colored progress bars)
- Recommendations grouped by priority (critical/high/medium)
- Per-page score table (all 9 metrics + word count)
- Score explanations per page
- JSON-LD and llms.txt outputs

Export: print-to-PDF via `window.open()` + `window.print()` (no server dependency).

## Key Hooks (`src/hooks/useDb.ts`)

| Hook | Purpose |
|------|---------|
| `useCrawls(options)` | Paginated crawl list with filter (q, grade, status) — 20/page default |
| `useCrawlDetail(crawlId)` | Single crawl + pages + analyses joined |
| `useCompletedCrawlsWithIssues()` | Crawls with critical issues aggregated from pageAnalyses |
| `deleteCrawls(ids[])` | Cascading delete (analyses → pages → crawl) in one transaction |

## Routing

- `/` — Dashboard (Dexie `useLiveQuery`)
- `/crawl` — New crawl form
- `/crawl/detail?id=N` — Detail view (query param, not dynamic segment — static export constraint)
- `/counter-measure` — AI remediation document generator (deep-link: `?crawlId=N&issueIndex=N&type=critical`)
- `/settings` — Model management + CORS proxy config
