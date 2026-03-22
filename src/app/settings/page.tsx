'use client';

import { useState, Fragment } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWebLLM } from '@/hooks/useWebLLM';
import type { WebLLMModel } from '@/lib/webllm/engine';
import { useContextProfile } from '@/hooks/useContextProfile';
import { CONTEXT_CONFIG } from '@/lib/config/context';
import { Cpu, Trash2, Monitor, Loader2, Download, Play, Square, HardDrive, Zap, ExternalLink } from 'lucide-react';

type SizeFilter = 'all' | 'tiny' | 'small' | 'medium' | 'large' | 'xl';

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
  const ctx = useContextProfile();
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
      case 'xl':          return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
      case 'recommended': return 'text-accent bg-accent/10 border-accent/20';
      case 'recommended-8gb': return 'text-purple-300 bg-purple-300/10 border-purple-300/20';
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

        {/* Context Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              <CardTitle>Context Profile</CardTitle>
              {ctx.isAuto && (
                <span className="text-xs text-muted">(auto)</span>
              )}
            </div>
          </CardHeader>
          <div className="space-y-4">
            {/* Toggle */}
            <div className="flex gap-2">
              {(['standard', 'large'] as const).map((p) => {
                const active = ctx.profile === p;
                const isAutoSelected = ctx.isAuto && (
                  (p === 'large' && ctx.isXlModel) || (p === 'standard' && !ctx.isXlModel)
                );
                return (
                  <button
                    key={p}
                    onClick={() => ctx.setProfile(ctx.override === p ? null : p)}
                    className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      active
                        ? p === 'large'
                          ? 'border-purple-400 bg-purple-400/10 text-purple-300'
                          : 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-surface2 text-muted hover:text-text'
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                    {isAutoSelected && <span className="ml-1.5 text-[10px] opacity-70">auto</span>}
                  </button>
                );
              })}
            </div>

            {/* Auto-detect note */}
            {ctx.isAuto && (
              <p className="text-xs text-muted">
                {ctx.isXlModel
                  ? 'Large profile auto-selected — a 7B+ model is loaded.'
                  : 'Standard profile auto-selected. Load a 7B+ model to switch to Large automatically.'}
                {' '}Click a button above to override.
              </p>
            )}

            {/* Comparison table */}
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
              <span className="text-muted font-medium">Setting</span>
              <span className="text-muted font-medium text-center">Standard</span>
              <span className="text-purple-300 font-medium text-center">Large</span>
              {[
                ['Analyser context',   `${(CONTEXT_CONFIG.standard.analyzerTruncate/1000).toFixed(0)}k chars`,  `${(CONTEXT_CONFIG.large.analyzerTruncate/1000).toFixed(0)}k chars`],
                ['Page analyser (full)', `${(CONTEXT_CONFIG.standard.pageAnalyserExcerptFull/1000).toFixed(0)}k / ${CONTEXT_CONFIG.standard.pageAnalyserTokensFull}t`, `${(CONTEXT_CONFIG.large.pageAnalyserExcerptFull/1000).toFixed(0)}k / ${CONTEXT_CONFIG.large.pageAnalyserTokensFull}t`],
                ['Page analyser (compact)', `${(CONTEXT_CONFIG.standard.pageAnalyserExcerptCompact/1000).toFixed(0)}k / ${CONTEXT_CONFIG.standard.pageAnalyserTokensCompact}t`, `${(CONTEXT_CONFIG.large.pageAnalyserExcerptCompact/1000).toFixed(0)}k / ${CONTEXT_CONFIG.large.pageAnalyserTokensCompact}t`],
                ['Counter-measure (full)', `${(CONTEXT_CONFIG.standard.counterMeasureExcerptFull/1000).toFixed(1)}k / ${CONTEXT_CONFIG.standard.counterMeasureTokensFull}t`, `${(CONTEXT_CONFIG.large.counterMeasureExcerptFull/1000).toFixed(1)}k / ${CONTEXT_CONFIG.large.counterMeasureTokensFull}t`],
              ].map(([label, std, lrg]) => (
                <Fragment key={label}>
                  <span className="text-muted">{label}</span>
                  <span className="font-mono text-text text-center">{std}</span>
                  <span className="font-mono text-purple-300 text-center">{lrg}</span>
                </Fragment>
              ))}
            </div>
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
            {(['all', 'tiny', 'small', 'medium', 'large', 'xl'] as SizeFilter[]).map((f) => (
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

          {/* XL tier notice */}
          {sizeFilter === 'xl' && (
            <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg space-y-1">
              <p className="text-xs text-purple-300 font-medium">Requires 8 GB+ discrete GPU (NVIDIA / AMD)</p>
              <p className="text-xs text-muted">
                These models run via WebGPU in-browser — no server needed. Each download is 4–6 GB and is cached in
                browser storage. Use <span className="font-mono">chrome://settings/content/all</span> to manage
                cache if needed. Models marked <span className="text-purple-300 font-medium">recommended-8gb</span> are
                the best starting point for SEO/GEO content generation.
              </p>
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
          {model.infoUrl && (
            <a
              href={model.infoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-purple-400 hover:text-purple-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              HuggingFace
            </a>
          )}
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
