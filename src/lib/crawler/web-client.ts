/**
 * Browser-based web crawler
 *
 * Fetches pages via CORS proxy, parses with DOMParser + Readability,
 * converts to markdown with Turndown. BFS link discovery with p-limit
 * concurrency control and rate limiting.
 */

import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import pLimit from 'p-limit';
import { normalizeUrl } from './url-normalize.js';
import { discoverLinks } from './link-discovery.js';
import { DomainRateLimiter } from './rate-limiter.js';
import { withRetry } from './retry.js';

export interface WebCrawlPage {
  url: string;
  title: string | null;
  description: string | null;
  markdown: string;
  charCount: number;
}

export interface WebCrawlOptions {
  limit?: number;
  corsProxy?: string;
  onPage?: (page: WebCrawlPage, index: number) => void;
  onProgress?: (message: string, progress: number) => void;
  signal?: AbortSignal;
}

const DEFAULT_CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const FALLBACK_CORS_PROXY = 'https://corsproxy.io/?url=';

/** Per-request timeout in ms — prevents indefinite hangs on slow proxies */
const FETCH_TIMEOUT_MS = 15_000;

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Remove script/style/nav/footer tags
turndown.remove(['script', 'style', 'nav', 'footer', 'noscript', 'iframe']);

const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

/**
 * Fetch with a per-request timeout. Uses Promise.race instead of
 * AbortSignal.any (which isn't available in older browsers).
 */
async function fetchViaProxy(
  url: string,
  corsProxy: string,
  signal?: AbortSignal,
): Promise<string> {
  const proxyUrl = `${corsProxy}${encodeURIComponent(url)}`;

  // Use Promise.race for timeout — works in all browsers
  const fetchPromise = fetch(proxyUrl, {
    signal,
    headers: { 'Accept': 'text/html' },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${FETCH_TIMEOUT_MS / 1000}s`)), FETCH_TIMEOUT_MS),
  );

  return Promise.race([fetchPromise, timeoutPromise]);
}

function parseHtmlToMarkdown(
  html: string,
  url: string,
): { markdown: string; title: string | null; description: string | null; links: string[] } {
  if (!parser) throw new Error('DOMParser not available');

  const doc = parser.parseFromString(html, 'text/html');

  // Extract metadata
  const title = doc.querySelector('title')?.textContent?.trim() ?? null;
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? null;

  // Discover links before Readability strips them
  const links = discoverLinks(doc, url);

  // Clone only <body> for Readability (much cheaper than full doc clone)
  const bodyClone = doc.body?.cloneNode(true);
  let article: ReturnType<Readability['parse']> = null;
  if (bodyClone) {
    const minimalDoc = document.implementation.createHTMLDocument('');
    minimalDoc.body.replaceWith(bodyClone);
    // Copy <head> metadata Readability needs (title, meta tags)
    const headTitle = doc.querySelector('title');
    if (headTitle) {
      const t = minimalDoc.createElement('title');
      t.textContent = headTitle.textContent;
      minimalDoc.head.appendChild(t);
    }
    article = new Readability(minimalDoc, { charThreshold: 50 }).parse();
  }

  let markdown: string;
  if (article?.content) {
    markdown = turndown.turndown(article.content);
    if (article.title && !markdown.startsWith('# ')) {
      markdown = `# ${article.title}\n\n${markdown}`;
    }
  } else {
    const body = doc.body?.innerHTML ?? '';
    markdown = turndown.turndown(body);
  }

  return { markdown, title: article?.title ?? title, description, links };
}

/**
 * Adaptive CORS proxy selector.
 *
 * Tracks consecutive failures per proxy. After FAILOVER_THRESHOLD
 * consecutive failures on the active proxy, switches all future
 * requests to the fallback. Resets the streak on any success.
 */
const FAILOVER_THRESHOLD = 3;

class ProxySelector {
  private activeProxy: string;
  private fallbackProxy: string;
  private consecutiveFailures = 0;
  private switched = false;

  constructor(primary: string, fallback: string) {
    this.activeProxy = primary;
    this.fallbackProxy = fallback;
  }

  get current(): string {
    return this.activeProxy;
  }

  get fallback(): string | null {
    return this.switched ? null : this.fallbackProxy;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    if (!this.switched && this.consecutiveFailures >= FAILOVER_THRESHOLD) {
      [this.activeProxy, this.fallbackProxy] = [this.fallbackProxy, this.activeProxy];
      this.consecutiveFailures = 0;
      this.switched = true;
    }
  }
}

/**
 * Crawl a website from the browser using CORS proxy.
 *
 * BFS traversal with configurable page limit, concurrency control,
 * and rate limiting per domain.
 */
export async function crawlFromBrowser(
  baseUrl: string,
  options: WebCrawlOptions = {},
): Promise<WebCrawlPage[]> {
  const {
    limit = 5,
    corsProxy = localStorage.getItem('corsProxy') || DEFAULT_CORS_PROXY,
    onPage,
    onProgress,
    signal,
  } = options;

  const proxy = new ProxySelector(corsProxy, FALLBACK_CORS_PROXY);
  const rateLimiter = new DomainRateLimiter(300);
  // Fix #6: reduce concurrency from 3→2 to lower timeout pressure
  const concurrency = pLimit(2);
  const visited = new Set<string>();
  const queue: string[] = [];
  const results: WebCrawlPage[] = [];

  const seedUrl = normalizeUrl(baseUrl) ?? baseUrl;
  queue.push(seedUrl);
  visited.add(seedUrl);

  let pageIndex = 0;

  onProgress?.('Starting crawl...', 0);

  while (queue.length > 0 && results.length < limit) {
    if (signal?.aborted) break;

    const batchSize = Math.min(queue.length, limit - results.length, 2);
    const batch = queue.splice(0, batchSize);

    const tasks = batch.map((url) =>
      concurrency(async () => {
        if (results.length >= limit || signal?.aborted) return;

        await rateLimiter.throttle(url);

        try {
          const html = await withRetry(
            async () => {
              try {
                const result = await fetchViaProxy(url, proxy.current, signal);
                proxy.recordSuccess();
                return result;
              } catch (primaryErr) {
                proxy.recordFailure();
                const fallback = proxy.fallback;
                if (fallback) {
                  const result = await fetchViaProxy(url, fallback, signal);
                  return result;
                }
                throw primaryErr;
              }
            },
            { maxRetries: 1, baseDelay: 1000 },
          );

          const { markdown, title, description, links } = parseHtmlToMarkdown(html, url);

          if (markdown.length < 50) return;

          const page: WebCrawlPage = {
            url,
            title,
            description,
            markdown,
            charCount: markdown.length,
          };

          results.push(page);
          const idx = pageIndex++;
          onPage?.(page, idx);

          const progress = Math.min(95, Math.round((results.length / limit) * 100));
          onProgress?.(`Crawled: ${url}`, progress);

          for (const link of links) {
            if (!visited.has(link) && results.length + queue.length < limit * 2) {
              visited.add(link);
              queue.push(link);
            }
          }
        } catch (err) {
          onProgress?.(
            `Failed: ${url} (${err instanceof Error ? err.message : 'unknown error'})`,
            Math.round((results.length / limit) * 100),
          );
        }
      }),
    );

    await Promise.all(tasks);
  }

  onProgress?.(`Crawl complete: ${results.length} pages`, 100);
  return results;
}
