import { Header } from '@/components/layout/header';
import { CrawlForm } from '@/components/crawl/crawl-form';

export default function NewCrawlPage() {
  return (
    <>
      <Header
        title="New Crawl"
        description="Enter a URL to crawl and analyze for GEO optimization"
      />
      <CrawlForm />
    </>
  );
}
