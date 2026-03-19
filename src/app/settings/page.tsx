'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWebLLM } from '@/hooks/useWebLLM';
import type { WebLLMModel } from '@/lib/webllm/engine';
import { Cpu, Trash2, Monitor, Loader2, Download, Play, Square, HardDrive, Zap } from 'lucide-react';

type SizeFilter = 'all' | 'tiny' | 'small' | 'medium' | 'large';

function readCorsProxy(): string {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem('corsProxy') ?? '' : '';
  } catch {
    return '';
  }
}

function writeCorsProxy(value: string) {
  try {
    if (value.trim()) {
      localStorage.setItem('corsProxy', value.trim());
    } else {
      localStorage.removeItem('corsProxy');
    }
  } catch { /* ignore */ }
}

export default function SettingsPage() {
  const webllm = useWebLLM();
  const [corsProxy, setCorsProxy] = useState(readCorsProxy);
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all');
  const [actionModel, setActionModel] = useState<string | null>(null);

  const filteredModels = sizeFilter === 'all'
    ? webllm.availableModels
    : webllm.availableModels.filter((m) => m.tags.includes(sizeFilter));

  const cachedCount = Object.values(webllm.cacheStatus).filter(Boolean).length;

  async function handleDownload(modelId: string) {
    setActionModel(modelId);
    try { await webllm.download(modelId); } finally { setActionModel(null); }
  }

  async function handleLoad(modelId: string) {
    setActionModel(modelId);
    try { await webllm.load(modelId); } finally { setActionModel(null); }
  }

  async function handleDelete(modelId: string) {
    if (webllm.currentModel === modelId) await webllm.unload();
    await webllm.deleteModel(modelId);
  }

  function formatVram(mb: number): string {
    return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  }

  function tagColor(tag: string): string {
    switch (tag) {
      case 'tiny':        return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'small':       return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case 'medium':      return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'large':       return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      case 'recommended': return 'text-accent bg-accent/10 border-accent/20';
      case 'fast':        return 'text-green-300 bg-green-300/10 border-green-300/20';
      default:            return 'text-muted bg-surface2 border-border';
    }
  }

  return (
    <>
      <Header
        title="Settings"
        description="Download AI models, configure CORS proxy, and check browser capabilities"
      />

      <div className="space-y-6">

        {/* WebGPU Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-accent" />
              <CardTitle>WebGPU Status</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={
                !webllm.hasWebGPU ? 'warning' :
                webllm.gpuInfo?.tier === 'dedicated' ? 'success' :
                webllm.gpuInfo?.tier === 'software' ? 'error' :
                webllm.gpuInfo?.tier === 'integrated' ? 'warning' :
                'default'
              }>
                {!webllm.hasWebGPU ? 'Not Available' :
                 webllm.gpuInfo?.tier === 'dedicated' ? 'Dedicated GPU' :
                 webllm.gpuInfo?.tier === 'integrated' ? 'Integrated GPU' :
                 webllm.gpuInfo?.tier === 'software' ? 'Software Renderer' :
                 'Detecting…'}
              </Badge>
              {webllm.gpuInfo && (webllm.gpuInfo.vendor || webllm.gpuInfo.device) && (
                <span className="text-sm text-muted font-mono">
                  {webllm.gpuInfo.vendor} {webllm.gpuInfo.device}
                </span>
              )}
            </div>
            {webllm.gpuInfo?.warning && (
              <p className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2">
                {webllm.gpuInfo.warning}
              </p>
            )}
            {!webllm.hasWebGPU && (
              <p className="text-xs text-muted">Use Chrome or Edge for WebGPU support.</p>
            )}
          </div>
        </Card>

        {/* Model Library */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" />
              <CardTitle>Model Library</CardTitle>
              {cachedCount > 0 && (
                <span className="text-xs text-muted">({cachedCount} downloaded)</span>
              )}
            </div>
          </CardHeader>

          {/* Size filter tabs */}
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {(['all', 'tiny', 'small', 'medium', 'large'] as SizeFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setSizeFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  sizeFilter === f
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface2 text-muted hover:text-text'
                }`}
              >
                {f === 'all' ? 'All Models' : f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && (
                  <span className="ml-1 opacity-60">
                    ({webllm.availableModels.filter((m) => m.tags.includes(f)).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Download / load progress bar */}
          {(webllm.isLoading || webllm.downloadingModel) && (
            <div className="mb-4 p-3 bg-surface2 rounded-lg border border-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text font-medium truncate pr-2">
                  {webllm.downloadingModel ? 'Downloading' : 'Loading'}:{' '}
                  {webllm.downloadingModel ?? webllm.currentModel ?? actionModel}
                </span>
                <span className="text-muted flex-shrink-0">
                  {Math.round(webllm.loadProgress.progress * 100)}%
                </span>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${webllm.loadProgress.progress * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted truncate">{webllm.loadProgress.text}</p>
            </div>
          )}

          {/* Model list */}
          <div className="space-y-2">
            {filteredModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                isCached={webllm.cacheStatus[model.id] ?? false}
                isActive={webllm.currentModel === model.id}
                isActionTarget={actionModel === model.id}
                isBusy={webllm.isBusy}
                onDownload={() => handleDownload(model.id)}
                onLoad={() => handleLoad(model.id)}
                onUnload={webllm.unload}
                onDelete={() => handleDelete(model.id)}
                formatVram={formatVram}
                tagColor={tagColor}
              />
            ))}
          </div>

          {webllm.error && (
            <p className="text-xs text-red-400 mt-3">{webllm.error}</p>
          )}
        </Card>

        {/* CORS Proxy */}
        <Card>
          <CardHeader><CardTitle>CORS Proxy</CardTitle></CardHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Pages are fetched through a CORS proxy to bypass browser restrictions.
              Leave empty to use the default (allorigins.win).
            </p>
            <input
              type="text"
              placeholder="https://api.allorigins.win/raw?url="
              value={corsProxy}
              onChange={(e) => { setCorsProxy(e.target.value); writeCorsProxy(e.target.value); }}
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text
                placeholder:text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            />
          </div>
        </Card>

        {/* Crawler Defaults */}
        <Card>
          <CardHeader><CardTitle>Crawler Defaults</CardTitle></CardHeader>
          <div className="space-y-3 text-sm">
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

// ── Model Card ────────────────────────────────────────────────────────────────

function ModelCard({
  model,
  isCached,
  isActive,
  isActionTarget,
  isBusy,
  onDownload,
  onLoad,
  onUnload,
  onDelete,
  formatVram,
  tagColor,
}: {
  model: WebLLMModel;
  isCached: boolean;
  isActive: boolean;
  isActionTarget: boolean;
  isBusy: boolean;
  onDownload: () => void;
  onLoad: () => void;
  onUnload: () => void;
  onDelete: () => void;
  formatVram: (mb: number) => string;
  tagColor: (tag: string) => string;
}) {
  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isActive
          ? 'border-accent bg-accent/5'
          : isCached
            ? 'border-border bg-surface2'
            : 'border-border/50'
      }`}
    >
      {/* Top row: name + tags + status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-text">{model.label}</span>
            {model.tags.map((tag) => (
              <span
                key={tag}
                className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${tagColor(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted mt-0.5 truncate" title={model.id}>{model.id}</p>
        </div>
        <div className="flex-shrink-0 pt-0.5">
          {isActive && <Badge variant="success">Active</Badge>}
          {!isActive && isCached && (
            <span className="flex items-center gap-1 text-xs text-muted">
              <HardDrive className="w-3 h-3" />
              Cached
            </span>
          )}
        </div>
      </div>

      {/* Bottom row: specs + actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{model.sizeHint}</span>
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {formatVram(model.vramMB)} VRAM
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isActive ? (
            <Button variant="ghost" size="sm" onClick={onUnload}>
              <Square className="w-3 h-3" />
              Unload
            </Button>
          ) : isCached ? (
            <>
              <Button variant="ghost" size="sm" onClick={onLoad} disabled={isBusy} className="text-accent">
                {isActionTarget ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Load
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} disabled={isBusy} className="text-red-400/70 hover:text-red-400">
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={onDownload} disabled={isBusy}>
              {isActionTarget ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Download
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
