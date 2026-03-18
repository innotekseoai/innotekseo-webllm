/**
 * Crawler types for browser-based crawling
 */

export interface CrawlPageMetadata {
  title?: string;
  description?: string;
}

export interface CrawlPage {
  url: string;
  markdown: string;
  metadata?: CrawlPageMetadata;
}
