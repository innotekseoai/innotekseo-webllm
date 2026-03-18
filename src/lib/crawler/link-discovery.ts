/**
 * Link discovery using native DOM APIs
 *
 * Replaces cheerio-based link extraction from v3.
 * Uses doc.querySelectorAll('a[href]') on DOMParser output.
 */

import { normalizeUrl } from './url-normalize.js';

/**
 * Discover same-domain links from a parsed Document.
 * Returns deduplicated, normalized URLs.
 */
export function discoverLinks(doc: Document, baseUrl: string): string[] {
  const baseHostname = new URL(baseUrl).hostname;
  const seen = new Set<string>();
  const results: string[] = [];

  const anchors = doc.querySelectorAll('a[href]');
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    if (!href) continue;

    // Skip non-navigational links
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      continue;
    }

    const normalized = normalizeUrl(href, baseUrl);
    if (!normalized) continue;

    // Same-domain filter
    try {
      const linkHostname = new URL(normalized).hostname;
      if (linkHostname !== baseHostname) continue;
    } catch {
      continue;
    }

    // Skip common non-content file extensions
    if (/\.(pdf|zip|tar|gz|jpg|jpeg|png|gif|svg|webp|mp4|mp3|css|js|woff2?)$/i.test(normalized)) {
      continue;
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push(normalized);
    }
  }

  return results;
}
