# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fully client-side web crawler with browser GPU AI analysis via WebLLM. Static Next.js export — no server infrastructure required. Crawls websites via CORS proxy, converts to markdown, runs GEO (Generative Engine Optimization) analysis using WebGPU-accelerated models in the browser.

## Commands

```bash
npm run dev                    # Next.js dev
npm run build                  # Static export build (output: 'export')
```

## Architecture

### Browser Crawler
- **Web client** (`src/lib/crawler/web-client.ts`) — fetch via CORS proxy → DOMParser → Readability → Turndown → markdown
- **Link discovery** (`src/lib/crawler/link-discovery.ts`) — native DOM `querySelectorAll('a[href]')`, same-domain filtering
- Uses `url-normalize.ts`, `retry.ts`, `rate-limiter.ts` (kept from v3)

### WebLLM AI
- `@mlc-ai/web-llm` loads models in-browser via WebGPU — no server dependency
- **Engine singleton** (`src/lib/webllm/engine.ts`) — `loadModel()` → `chatCompletion()` → `unloadModel()`
- **Analyzer** (`src/lib/webllm/analyzer.ts`) — same prompts/parsing as v3 (regex → JSON → defaults)
- Models auto-cached in IndexedDB by WebLLM runtime

### Storage
- IndexedDB via Dexie.js (`src/lib/db/dexie-client.ts`)
- Tables: crawls, crawlPages (with inline markdown), pageAnalyses
- Reactive queries via `useLiveQuery` in hooks

### Analysis Engine
- `src/lib/analysis/engine.ts` — grading + aggregation (pure functions, kept from v3)
- `src/lib/ai/prompts.ts` — prompt building + score parsing
- `src/types/analysis.ts` — Zod schemas for GeoPageAnalysis

### Key Directories
- `src/lib/crawler/` — Browser crawler, link discovery, URL normalization
- `src/lib/ai/` — Prompts, truncation, JSON repair, schema detection/generation
- `src/lib/webllm/` — WebLLM engine singleton + analyzer
- `src/lib/analysis/` — Grading engine
- `src/lib/db/` — Dexie.js IndexedDB client
- `src/lib/export/` — Client-side JSON/CSV export
- `src/hooks/` — React hooks (useDb, useWebLLM, useCrawler)
- `src/types/` — Zod schemas

### Routing
- `/` — Dashboard (Dexie queries)
- `/crawl` — New crawl form
- `/crawl/detail?id=N` — Crawl detail (static export, no dynamic segments)
- `/settings` — WebLLM model management, CORS proxy config
