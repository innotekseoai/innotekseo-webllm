'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { Globe, Loader2, Cpu, AlertTriangle } from 'lucide-react';
import { useWebLLM } from '@/hooks/useWebLLM';
import { createCrawl } from '@/hooks/useCrawler';

export function CrawlForm() {
  const router = useRouter();
  const webllm = useWebLLM();
  const [url, setUrl] = useState('');
  const [limit, setLimit] = useState(5);
  const [analyze, setAnalyze] = useState(true);
  const [selectedModel, setSelectedModel] = useState(
    webllm.currentModel ?? webllm.availableModels[5]?.id ?? webllm.availableModels[0]?.id ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Check if any model is cached (for showing helpful messages)
  const hasCachedModels = Object.values(webllm.cacheStatus).some(Boolean);
  const needsModel = analyze && !webllm.isReady;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!url.trim()) {
      setError('URL is required');
      return;
    }

    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    try {
      new URL(finalUrl);
    } catch {
      setError('Invalid URL');
      return;
    }

    // Validate model is available when analysis is requested
    if (analyze) {
      if (!webllm.hasWebGPU) {
        setError('WebGPU not supported in this browser. Disable analysis or use Chrome/Edge.');
        return;
      }

      if (!webllm.isReady) {
        // Try to load the selected model
        setSubmitting(true);
        try {
          await webllm.load(selectedModel);
        } catch (err) {
          setError(
            `Failed to load model: ${err instanceof Error ? err.message : 'unknown error'}. ` +
            'Try loading from Settings first, or disable analysis.',
          );
          setSubmitting(false);
          return;
        }
      }

      // Double-check model is actually loaded after load attempt
      if (!webllm.isReady) {
        setError('No AI model loaded. Load a model from Settings or the dashboard first.');
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(true);
    try {
      const crawlId = await createCrawl(finalUrl, { limit, analyze });
      router.push(`/crawl/detail?id=${crawlId}&analyze=${analyze}&limit=${limit}`);
    } catch {
      setError('Failed to create crawl');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="url" className="block text-sm font-medium text-muted">
            Website URL
          </label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-border bg-surface2/60 text-xs text-muted select-none">
              https://
            </span>
            <input
              id="url"
              type="text"
              placeholder="example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value.replace(/^https?:\/\//i, ''))}
              className={`flex-1 bg-surface2 border border-border rounded-r-lg px-3 py-2 text-sm text-text
                placeholder:text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30
                transition-colors ${error ? 'border-red-500/50' : ''}`}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted">
            Page Limit: {limit}
          </label>
          <input
            type="range"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>1</span>
            <span>200</span>
          </div>
        </div>

        {/* AI Analysis toggle */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAnalyze(!analyze)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                analyze ? 'bg-accent' : 'bg-border'
              } cursor-pointer`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  analyze ? 'translate-x-4' : ''
                }`}
              />
            </button>
            <label className="text-sm font-medium text-muted flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Run GEO Analysis (WebLLM)
            </label>
          </div>

          {analyze && (
            <div className="space-y-1.5">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text
                  focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
              >
                {webllm.availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.sizeHint}){webllm.cacheStatus[m.id] ? ' - cached' : ''}
                  </option>
                ))}
              </select>

              {webllm.isReady && (
                <p className="text-xs text-green-400/70">
                  Model loaded: {webllm.currentModel}
                </p>
              )}

              {needsModel && !webllm.hasWebGPU && (
                <p className="text-xs text-red-400">
                  WebGPU not detected. Use Chrome or Edge for GPU acceleration.
                </p>
              )}

              {needsModel && webllm.hasWebGPU && !hasCachedModels && (
                <div className="flex items-start gap-2 p-2 bg-yellow-400/5 border border-yellow-400/20 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-yellow-400/80">
                    <p>No models downloaded yet. The selected model will be downloaded when you start the crawl (~{webllm.availableModels.find((m) => m.id === selectedModel)?.sizeHint ?? 'varies'}).</p>
                    <Link href="/settings" className="underline">Download from Settings</Link> for faster starts.
                  </div>
                </div>
              )}

              {needsModel && webllm.hasWebGPU && hasCachedModels && (
                <p className="text-xs text-yellow-400/70">
                  Model will be loaded when crawl starts. Pick a cached model for instant start.
                </p>
              )}
            </div>
          )}
        </div>

        <Button type="submit" disabled={submitting || webllm.isLoading} className="w-full">
          {submitting || webllm.isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {webllm.isLoading ? `Loading model... ${Math.round(webllm.loadProgress.progress * 100)}%` : 'Starting...'}
            </>
          ) : (
            <>
              <Globe className="w-4 h-4" />
              {analyze ? 'Crawl & Analyze' : 'Start Crawl'}
            </>
          )}
        </Button>
      </form>
    </Card>
  );
}
