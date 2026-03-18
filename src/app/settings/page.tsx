'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWebLLM } from '@/hooks/useWebLLM';
import { Cpu, Trash2, Monitor, Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const webllm = useWebLLM();
  const [corsProxy, setCorsProxy] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('corsProxy') ?? '' : '',
  );
  const [loadingModel, setLoadingModel] = useState<string | null>(null);

  async function handleLoadModel(modelId: string) {
    setLoadingModel(modelId);
    await webllm.load(modelId);
    setLoadingModel(null);
  }

  async function handleClearCache() {
    // WebLLM stores models in IndexedDB caches
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.includes('webllm') || key.includes('mlc')) {
          await caches.delete(key);
        }
      }
    }
    // Also try clearing IndexedDB databases used by WebLLM
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name && (db.name.includes('webllm') || db.name.includes('mlc') || db.name.includes('tvmjs'))) {
        indexedDB.deleteDatabase(db.name);
      }
    }
    alert('Model cache cleared. Models will re-download on next use.');
  }

  function saveCorsProxy(value: string) {
    setCorsProxy(value);
    if (value.trim()) {
      localStorage.setItem('corsProxy', value.trim());
    } else {
      localStorage.removeItem('corsProxy');
    }
  }

  return (
    <>
      <Header
        title="Settings"
        description="Configure AI models, CORS proxy, and browser settings"
      />

      <div className="space-y-6 max-w-2xl">
        {/* WebGPU Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-accent" />
              <CardTitle>WebGPU Status</CardTitle>
            </div>
          </CardHeader>
          <div className="flex items-center gap-3">
            <Badge variant={webllm.hasWebGPU ? 'success' : 'warning'}>
              {webllm.hasWebGPU ? 'Supported' : 'Not Available'}
            </Badge>
            <span className="text-sm text-muted">
              {webllm.hasWebGPU
                ? 'GPU acceleration available for AI inference'
                : 'Use Chrome or Edge for WebGPU support'}
            </span>
          </div>
        </Card>

        {/* WebLLM Models */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-accent" />
                <CardTitle>WebLLM Models</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearCache} className="text-red-400">
                <Trash2 className="w-3 h-3" />
                Clear Cache
              </Button>
            </div>
          </CardHeader>

          {/* Loading progress */}
          {webllm.isLoading && (
            <div className="mb-4 space-y-2">
              <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${webllm.loadProgress.progress * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted">{webllm.loadProgress.text}</p>
            </div>
          )}

          <div className="space-y-2">
            {webllm.availableModels.map((model) => {
              const isActive = webllm.currentModel === model.id;
              const isLoading = loadingModel === model.id;
              return (
                <div
                  key={model.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isActive
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:bg-surface2/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text">{model.label}</p>
                    <p className="text-xs text-muted">{model.id} &middot; {model.sizeHint}</p>
                  </div>
                  {isActive ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Loaded</Badge>
                      <Button variant="ghost" size="sm" onClick={webllm.unload}>
                        Unload
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadModel(model.id)}
                      disabled={webllm.isLoading}
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Load'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {webllm.error && (
            <p className="text-xs text-red-400 mt-2">{webllm.error}</p>
          )}
        </Card>

        {/* CORS Proxy */}
        <Card>
          <CardHeader>
            <CardTitle>CORS Proxy</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Pages are fetched through a CORS proxy to bypass browser restrictions.
              Leave empty to use the default (allorigins.win).
            </p>
            <input
              type="text"
              placeholder="https://api.allorigins.win/raw?url="
              value={corsProxy}
              onChange={(e) => saveCorsProxy(e.target.value)}
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text
                placeholder:text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            />
          </div>
        </Card>

        {/* Crawler Defaults */}
        <Card>
          <CardHeader>
            <CardTitle>Crawler Defaults</CardTitle>
          </CardHeader>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Default page limit</span>
              <span className="text-text font-mono">50</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Concurrency</span>
              <span className="text-text font-mono">3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Rate limit</span>
              <span className="text-text font-mono">300ms/domain</span>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
