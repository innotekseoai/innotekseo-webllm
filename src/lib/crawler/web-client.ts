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

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Remove script/style/nav/footer tags
turndown.remove(['script', 'style', 'nav', 'footer', 'noscript', 'iframe']);

const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

async function fetchViaProxy(
  url: string,
  corsProxy: string,
  signal?: AbortSignal,
): Promise<string> {
  const proxyUrl = `${corsProxy}${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, {
    signal,
    headers: { 'Accept': 'text/html' },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return res.text();
}

function parseHtmlToMarkdown(
  html: string,
  url: string,
): { markdown: string; title: string | null; description: string | null; links: string[] } {
  if (!parser) throw new Error('DOMParser not available');

  const doc = parser.parseFromString(html, 'text/html');

  // Extract metadata before Readability modifies the DOM
  const title = doc.querySelector('title')?.textContent?.trim() ?? null;
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? null;

  // Discover links before Readability strips them
  const links = discoverLinks(doc, url);

  // Clone doc for Readability (it mutates the DOM)
  const clone = doc.cloneNode(true) as Document;
  const article = new Readability(clone, { charThreshold: 50 }).parse();

  let markdown: string;
  if (article?.content) {
    markdown = turndown.turndown(article.content);
    // Prepend title if Readability found one
    if (article.title && !markdown.startsWith('# ')) {
      markdown = `# ${article.title}\n\n${markdown}`;
    }
  } else {
    // Fallback: convert body directly
    const body = doc.body?.innerHTML ?? '';
    markdown = turndown.turndown(body);
  }

  return { markdown, title: article?.title ?? title, description, links };
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
    limit = 50,
    corsProxy = localStorage.getItem('corsProxy') || DEFAULT_CORS_PROXY,
    onPage,
    onProgress,
    signal,
  } = options;

  const rateLimiter = new DomainRateLimiter(300);
  const concurrency = pLimit(3);
  const visited = new Set<string>();
  const queue: string[] = [];
  const results: WebCrawlPage[] = [];

  // Normalize and seed the starting URL
  const seedUrl = normalizeUrl(baseUrl) ?? baseUrl;
  queue.push(seedUrl);
  visited.add(seedUrl);

  let pageIndex = 0;

  onProgress?.('Starting crawl...', 0);

  while (queue.length > 0 && results.length < limit) {
    if (signal?.aborted) break;

    // Take a batch from queue
    const batchSize = Math.min(queue.length, limit - results.length, 3);
    const batch = queue.splice(0, batchSize);

    const tasks = batch.map((url) =>
      concurrency(async () => {
        if (results.length >= limit || signal?.aborted) return;

        await rateLimiter.throttle(url);

        try {
          const html = await withRetry(
            async () => {
              try {
                return await fetchViaProxy(url, corsProxy, signal);
              } catch {
                // Try fallback proxy
                if (corsProxy !== FALLBACK_CORS_PROXY) {
                  return await fetchViaProxy(url, FALLBACK_CORS_PROXY, signal);
                }
                throw new Error(`Failed to fetch ${url}`);
              }
            },
            { maxRetries: 1, baseDelay: 1000 },
          );

          const { markdown, title, description, links } = parseHtmlToMarkdown(html, url);

          if (markdown.length < 50) return; // Skip empty pages

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

          // Add new links to queue
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
