# InnotekSEO WebLLM

> **Fully client-side** web crawler + GEO analysis. No server. No cloud AI. Everything runs in your browser.

Crawls websites via CORS proxy, converts pages to markdown, and runs **Generative Engine Optimization (GEO)** scoring using WebGPU-accelerated language models loaded directly in the browser via [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm). All data persists locally in IndexedDB.

---

## Features

- **Zero server infrastructure** — static Next.js export, deploy anywhere (GitHub Pages, Netlify, S3)
- **On-device AI inference** — WebGPU models run in-browser; no API keys, no usage costs
- **GEO scoring** — 9 metrics per page (entity clarity, content quality, trust signals, authority, etc.)
- **Counter-Measure Generator** — AI-written remediation documents for critical issues
- **Full-crawl PDF reports** — grade badge, metric bars, per-page scores, recommendations
- **Structured outputs** — JSON-LD schema markup + llms.txt machine-readable directory
- **Offline-capable** — models cached in browser Cache Storage after first download
- **Adaptive GPU handling** — auto-detects integrated vs discrete GPU, adjusts token budgets

---

## Quick Start

```bash
git clone https://github.com/innotekseoai/innotekseo-webllm
cd innotekseo-webllm
npm install
npm run dev
# Open http://localhost:3000
```

### Requirements

- **Node.js** 20+
- **Browser with WebGPU support** — Chrome 113+ or Edge 113+ recommended
  - Integrated GPUs (Intel/Apple M-series) work but use compact mode automatically
  - Discrete GPUs (NVIDIA/AMD) give best results

---

## Usage

### 1. Load an AI Model

Go to **Settings** → select a model → click **Download & Load**.

Models are cached in your browser after the first download. The recommended model is **Qwen 2.5 1.5B** (~900MB download, ~1.6GB VRAM).

| Size | Model | Download | VRAM | Best for |
|------|-------|----------|------|---------|
| Tiny | SmolLM2 135M | ~140MB | 360MB | Testing, slow GPUs |
| Tiny | SmolLM2 360M | ~200MB | 376MB | Low-VRAM devices |
| Small | Qwen 2.5 0.5B | ~350MB | 945MB | Integrated GPUs |
| Small | Llama 3.2 1B | ~600MB | 879MB | Balanced speed |
| **Medium** | **Qwen 2.5 1.5B** | ~900MB | 1630MB | **Recommended** |
| Medium | SmolLM2 1.7B | ~1GB | 1774MB | Alternative medium |
| Large | Llama 3.2 3B | ~1.8GB | 2264MB | High-quality analysis |
| Large | Phi 3.5 Mini | ~2GB | 2520MB | 1k context limit |

### 2. Run a Crawl

Go to **New Crawl** → enter a URL → set page limit → click **Start Crawl**.

The crawler:
1. Fetches pages via CORS proxy (3 proxies with automatic failover)
2. Extracts readable content via Mozilla Readability → converts to markdown
3. Discovers and follows same-domain links (BFS, up to your page limit)
4. Analyzes each page with the loaded AI model
5. Produces an overall grade (A–F) and a GEO premium score (0–100)

### 3. Review Results

From the **Dashboard**, click any completed crawl to see:
- Overall grade and premium GEO score
- Per-page scores across all 9 metrics
- Prioritized recommendations (critical / high / medium)
- Generated JSON-LD schema markup
- llms.txt machine-readable content directory
- Full PDF report (via print dialog)

### 4. Counter-Measure Generator

Go to **Counter Measure** → select a crawl → pick a critical issue → click **Generate**.

The AI writes a structured remediation document with root cause analysis, step-by-step fix plan, schema recommendations, and expected outcomes. Output can be copied or saved as PDF.

---

## GEO Metrics

Each page is scored on 9 dimensions (1–10 scale):

| Metric | What it measures |
|--------|-----------------|
| **Entity Clarity** | How clearly the page identifies its subject |
| **Content Quality** | Writing quality, depth, and information value |
| **Semantic Structure** | Heading hierarchy, markup, and organization |
| **Entity Richness** | Named entities, relationships, and context |
| **Citation Readiness** | Verifiable facts, dates, and statistics |
| **Technical SEO** | Meta tags, schema markup, crawlability |
| **User Intent Alignment** | Match between content and likely search intent |
| **Trust Signals** | Authorship, credentials, and transparency |
| **Authority** | Domain expertise and external validation |

Site-level aggregation produces:
- **Overall Grade** (A–F) — based on entity clarity, fact density, and schema completeness
- **Premium Score** (0–100) — weighted average across all metrics
- **JSON-LD** — schema.org structured data for the site
- **llms.txt** — machine-readable page directory for AI crawlers

---

## Architecture

```
Browser (100% client-side)
│
├── React UI (Next.js 15, static export)
│   ├── / ─────────── Dashboard
│   ├── /crawl ─────── New crawl form
│   ├── /crawl/detail ─ Results + report modal
│   ├── /counter-measure ─ AI remediation generator
│   └── /settings ──── Model management + CORS proxy config
│
├── Hooks
│   ├── useCrawler ─── Crawl + analyze orchestration, circuit breaker
│   ├── useWebLLM ──── Model load/download/cache lifecycle
│   └── useDb ──────── Reactive IndexedDB queries (useLiveQuery)
│
├── Core Libraries
│   ├── crawler/
│   │   ├── web-client.ts ─── CORS proxy fetch → Readability → Turndown → markdown
│   │   └── link-discovery.ts ─ DOM querySelectorAll, same-domain BFS
│   ├── webllm/
│   │   ├── engine.ts ──────── WebLLM singleton, chatCompletion, GPU detection
│   │   └── analyzer.ts ─────── Prompt → parse → GeoPageAnalysis
│   ├── ai/
│   │   ├── prompts.ts ─────── GEO scoring prompt (CSV format)
│   │   ├── counter-measure-prompt.ts ─ Remediation doc prompt (compact/full)
│   │   ├── truncate.ts ─────── Smart heading-priority truncation
│   │   ├── schema-detect.ts ── Heuristic JSON-LD type detection
│   │   ├── schema-generator.ts ─ JSON-LD builder
│   │   └── recommendations.ts ─ Dedup, categorize, sort by impact
│   └── analysis/
│       └── engine.ts ────────── Grade computation + site aggregation
│
└── Storage: Dexie.js (IndexedDB)
    ├── crawls ──────── Metadata, grade, aggregated metrics
    ├── crawlPages ──── Per-page markdown (inline)
    └── pageAnalyses ── Per-page scores, JSON-LD, recommendations
```

### Key Technical Decisions

**Why WebLLM instead of a server?**
Static deployment with no operating costs. Models run on the user's GPU via WebGPU — no API keys, no rate limits, no data sent to external services.

**Why CSV prompt format instead of JSON?**
Small quantized models (135M–1.5B params) reliably produce `key: value` lines but frequently produce malformed JSON. CSV-style with pipe-separated reasons for low scores gives a higher parse rate. Three-strategy fallback: regex → JSON → hardcoded defaults.

**Why inline markdown in IndexedDB?**
Avoids a separate file system or object store lookup per page during analysis. Dexie handles blobs up to the browser's storage quota (typically gigabytes).

**Why BFS with CORS proxies instead of a headless browser?**
Keeps the app fully static. CORS proxies (allorigins, corsproxy.io, codetabs) handle the cross-origin restriction. Three proxies with adaptive failover handle reliability.

---

## Development

```bash
npm run dev          # Dev server at http://localhost:3000
npm run build        # Static export to /out
npm test             # Vitest unit tests
npm run test:watch   # Watch mode
```

### Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── page.tsx            # Dashboard
│   ├── crawl/page.tsx      # New crawl
│   ├── crawl/detail/page.tsx  # Results
│   ├── counter-measure/page.tsx
│   └── settings/page.tsx
├── components/
│   ├── crawl/              # Crawl UI, report modal, terminal
│   ├── layout/             # Header, sidebar
│   └── ui/                 # Primitives (card, button, badge, input)
├── hooks/
│   ├── useCrawler.ts
│   ├── useWebLLM.ts
│   └── useDb.ts
├── lib/
│   ├── ai/                 # Prompts, truncation, schema, recommendations
│   ├── analysis/           # Grading engine
│   ├── crawler/            # Web client, link discovery, rate limiter
│   ├── db/                 # Dexie client
│   ├── export/             # JSON/CSV export
│   └── webllm/             # Engine singleton + analyzer
└── types/
    └── analysis.ts         # Zod schemas
```

### CORS Proxy Configuration

Default proxies (tried in order, failover after 2 consecutive failures):
1. `https://api.allorigins.win/raw?url=`
2. `https://corsproxy.io/?url=`
3. `https://api.codetabs.com/v1/proxy?quest=`

Custom proxies can be added in **Settings** and are prepended to the list.

---

## Deployment

This is a static Next.js export. Build output lands in `/out`.

```bash
npm run build
# Deploy /out to any static host
```

GitHub Pages deployment is configured in `.github/workflows/` and triggers on push to `main`.

---

## License

Private — InnotekSEO
