/**
 * WebLLM engine singleton
 *
 * Manages browser-side GPU inference via @mlc-ai/web-llm.
 * Models are automatically cached in Cache Storage by the WebLLM runtime.
 * Provides download-only mode, cache checking, and per-model deletion.
 */

import type { MLCEngine } from '@mlc-ai/web-llm';

export interface WebLLMModel {
  id: string;
  label: string;
  sizeHint: string;
  vramMB: number;
  tags: string[];
  infoUrl?: string;
}

/**
 * Curated model list — small instruction-following models that work
 * well for GEO scoring. Ordered by quality/size tradeoff.
 */
export const AVAILABLE_MODELS: WebLLMModel[] = [
  // -- Tiny: <500MB VRAM, fast on any GPU --
  {
    id: 'SmolLM2-135M-Instruct-q0f16-MLC',
    label: 'SmolLM2 135M',
    sizeHint: '~140MB download',
    vramMB: 360,
    tags: ['tiny', 'fast'],
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    label: 'SmolLM2 360M',
    sizeHint: '~200MB download',
    vramMB: 376,
    tags: ['tiny', 'fast'],
  },
  // -- Small: 500MB–1GB VRAM --
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 0.5B',
    sizeHint: '~350MB download',
    vramMB: 945,
    tags: ['small'],
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen 2.5 0.5B (f32)',
    sizeHint: '~400MB download',
    vramMB: 1060,
    tags: ['small'],
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 1B',
    sizeHint: '~600MB download',
    vramMB: 879,
    tags: ['small'],
  },
  // -- Medium: 1–2GB VRAM, best quality for the size --
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 1.5B',
    sizeHint: '~900MB download',
    vramMB: 1630,
    tags: ['medium', 'recommended'],
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    label: 'SmolLM2 1.7B',
    sizeHint: '~1GB download',
    vramMB: 1774,
    tags: ['medium'],
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    label: 'Llama 3.2 1B (f32)',
    sizeHint: '~800MB download',
    vramMB: 1129,
    tags: ['medium'],
  },
  // -- Large: 2–3GB VRAM, highest quality --
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen 2.5 1.5B (f32)',
    sizeHint: '~1.2GB download',
    vramMB: 1889,
    tags: ['large'],
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 3B',
    sizeHint: '~1.8GB download',
    vramMB: 2264,
    tags: ['large'],
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC-1k',
    label: 'Phi 3.5 Mini (1k ctx)',
    sizeHint: '~2GB download',
    vramMB: 2520,
    tags: ['large'],
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 3B',
    sizeHint: '~2GB download',
    vramMB: 2800,
    tags: ['large'],
  },
  // -- XL: 4–6GB VRAM, 7B–9B models — requires 8GB+ discrete GPU --
  {
    id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 7B',
    sizeHint: '~4.5GB download',
    vramMB: 4600,
    tags: ['xl', 'recommended-8gb'],
    infoUrl: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct',
  },
  {
    id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.1 8B',
    sizeHint: '~4.9GB download',
    vramMB: 5000,
    tags: ['xl'],
    infoUrl: 'https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct',
  },
  {
    id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
    label: 'Hermes 3 Llama 3.1 8B',
    sizeHint: '~4.9GB download',
    vramMB: 5000,
    tags: ['xl'],
    infoUrl: 'https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B',
  },
  {
    id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
    label: 'DeepSeek R1 7B (reasoning)',
    sizeHint: '~4.5GB download',
    vramMB: 4600,
    tags: ['xl'],
    infoUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
  },
  {
    id: 'gemma-2-9b-it-q4f16_1-MLC',
    label: 'Gemma 2 9B',
    sizeHint: '~5.5GB download',
    vramMB: 5700,
    tags: ['xl'],
    infoUrl: 'https://huggingface.co/google/gemma-2-9b-it',
  },
];

let engine: MLCEngine | null = null;
let currentModelId: string | null = null;

/**
 * Check if the browser supports WebGPU.
 */
export function supportsWebGPU(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'gpu' in navigator;
}

export type GpuTier = 'none' | 'software' | 'integrated' | 'dedicated';

export interface GpuInfo {
  supported: boolean;
  tier: GpuTier;
  vendor: string;
  device: string;
  architecture: string;
  /** True when running on integrated or software GPU — WebLLM may OOM or be very slow */
  degraded: boolean;
  warning: string | null;
}

/**
 * Probe the active WebGPU adapter and classify the GPU tier.
 * Returns info about vendor, device type, and whether the GPU is likely
 * too weak for LLM inference (integrated / software fallback).
 */
export async function getGpuInfo(): Promise<GpuInfo> {
  const unsupported: GpuInfo = {
    supported: false,
    tier: 'none',
    vendor: '',
    device: '',
    architecture: '',
    degraded: true,
    warning: 'WebGPU is not supported in this browser. Use Chrome or Edge.',
  };

  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return unsupported;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gpu = (navigator as any).gpu;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adapter: any = null;
  try {
    // Prefer high-performance (discrete) GPU
    adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch {
    return unsupported;
  }

  if (!adapter) {
    return { ...unsupported, supported: true, warning: 'No WebGPU adapter found. GPU may be disabled or unavailable.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let info: any;
  try {
    info = await adapter.requestAdapterInfo();
  } catch {
    // requestAdapterInfo may be blocked in some contexts
    return {
      supported: true,
      tier: 'dedicated',
      vendor: 'unknown',
      device: 'unknown',
      architecture: 'unknown',
      degraded: false,
      warning: null,
    };
  }

  const vendor = (info.vendor ?? '').toLowerCase();
  const device = (info.device ?? '').toLowerCase();
  const architecture = (info.architecture ?? '').toLowerCase();
  const description = (info.description ?? '').toLowerCase();
  const combined = `${vendor} ${device} ${architecture} ${description}`;

  // Software / CPU renderers
  const isSoftware =
    combined.includes('swiftshader') ||
    combined.includes('llvmpipe') ||
    combined.includes('software') ||
    combined.includes('microsoft basic render') ||
    combined.includes('warp');

  // Integrated GPU vendors/names
  const isIntegrated =
    vendor.includes('intel') ||
    combined.includes('uhd graphics') ||
    combined.includes('iris') ||
    combined.includes('adreno') ||         // Qualcomm integrated (mobile)
    combined.includes('apple m') ||         // Apple Silicon (unified, but capable)
    (vendor.includes('amd') && combined.includes('vega'));

  // Dedicated GPU check
  const isDedicated =
    vendor.includes('nvidia') ||
    (vendor.includes('amd') && !isIntegrated) ||
    vendor.includes('qualcomm') && combined.includes('adreno') && !isIntegrated;

  let tier: GpuTier;
  let warning: string | null = null;

  if (isSoftware) {
    tier = 'software';
    warning = 'WebGPU is running on a software renderer. LLM inference will be extremely slow or fail. Enable GPU acceleration in your browser settings.';
  } else if (isDedicated) {
    tier = 'dedicated';
  } else if (isIntegrated) {
    tier = 'integrated';
    warning = 'WebGPU is using an integrated GPU. LLM inference may be slow or run out of memory. Consider switching to a dedicated GPU in your OS graphics settings.';
  } else {
    tier = 'dedicated'; // Unknown but hardware — optimistic
  }

  return {
    supported: true,
    tier,
    vendor: info.vendor ?? 'unknown',
    device: info.device ?? 'unknown',
    architecture: info.architecture ?? 'unknown',
    degraded: tier === 'software' || tier === 'integrated',
    warning,
  };
}

/**
 * Check if a model is already downloaded in the browser cache.
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    return await hasModelInCache(modelId);
  } catch {
    return false;
  }
}

/**
 * Delete a specific model from the browser cache.
 */
export async function deleteModelFromCache(modelId: string): Promise<void> {
  const { deleteModelInCache } = await import('@mlc-ai/web-llm');
  await deleteModelInCache(modelId);
}

/**
 * Download a model to the browser cache without keeping it loaded.
 *
 * Loads the engine to trigger the download, then immediately unloads
 * to free GPU memory. The weights remain in Cache Storage.
 */
export async function downloadModel(
  modelId: string,
  onProgress?: (progress: { text: string; progress: number }) => void,
): Promise<void> {
  const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

  const tempEngine = await CreateMLCEngine(modelId, {
    initProgressCallback: (report) => {
      onProgress?.({
        text: report.text,
        progress: report.progress,
      });
    },
  });

  // Unload engine but weights stay cached
  await tempEngine.unload();
}

/**
 * Load a WebLLM model for inference. Downloads on first use, instant from cache.
 */
export async function loadModel(
  modelId: string,
  onProgress?: (progress: { text: string; progress: number }) => void,
): Promise<void> {
  if (engine && currentModelId === modelId) return;

  if (engine) {
    await unloadModel();
  }

  const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

  engine = await CreateMLCEngine(modelId, {
    initProgressCallback: (report) => {
      onProgress?.({
        text: report.text,
        progress: report.progress,
      });
    },
  });

  currentModelId = modelId;
}

/**
 * Unload the current model and free GPU memory.
 */
export async function unloadModel(): Promise<void> {
  if (engine) {
    await engine.unload();
    engine = null;
    currentModelId = null;
  }
}

export function getEngine(): MLCEngine | null {
  return engine;
}

export function isModelLoaded(): boolean {
  return engine !== null;
}

export function getCurrentModelId(): string | null {
  return currentModelId;
}

/**
 * Inference timeout — WebGPU errors can cause promises to hang
 * indefinitely. 30s is enough for ~400 tokens on mobile GPUs.
 */
const INFERENCE_TIMEOUT_MS = 30_000;

export interface ChatCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface InferenceStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokensPerSec: number;
  elapsedMs: number;
}

export interface InferenceCallbacks {
  /** Called with each new token as it's generated */
  onToken?: (token: string, partialText: string) => void;
  /** Called when inference completes with stats */
  onStats?: (stats: InferenceStats) => void;
}

/**
 * Run streaming chat completion with the loaded model.
 * Streams tokens to onToken callback for live UI updates.
 * Includes a timeout to prevent indefinite hangs on GPU errors.
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  callbacks?: InferenceCallbacks,
  options?: ChatCompletionOptions,
): Promise<string> {
  if (!engine) throw new Error('No model loaded');

  // Hard-reset the KV cache before every generation. A single authoritative
  // reset here is more reliable than also resetting in the finally block —
  // a post-generation reset can silently fail when the GPU is still settling,
  // leaving stale KV tokens that cause context to appear to accumulate across
  // consecutive calls.
  await engine.resetChat();
  // Give WebGPU's GC a window to collect stale KV cache buffers from the
  // previous generation. resetChat() destroys + recreates GPU buffer
  // allocations; without a yield the old allocation may not be released
  // before the new one is created, causing VRAM to grow with each call.
  await new Promise<void>(resolve => setTimeout(resolve, 200));

  const startTime = performance.now();
  let fullText = '';
  let timedOut = false;

  const effectiveTimeout = options?.timeoutMs ?? INFERENCE_TIMEOUT_MS;
  const timer = setTimeout(() => { timedOut = true; }, effectiveTimeout);

  try {
    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 400,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      if (timedOut) {
        throw new Error(`Inference timeout (${effectiveTimeout / 1000}s) — GPU may be overloaded`);
      }

      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        fullText += delta;
        callbacks?.onToken?.(delta, fullText);
      }

      // Last chunk includes usage stats
      if (chunk.usage) {
        const elapsedMs = performance.now() - startTime;
        const stats: InferenceStats = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
          tokensPerSec: chunk.usage.completion_tokens / (elapsedMs / 1000),
          elapsedMs,
        };
        callbacks?.onStats?.(stats);
      }
    }

    // If no usage came from stream, compute basic stats
    if (callbacks?.onStats && fullText) {
      const elapsedMs = performance.now() - startTime;
      const approxTokens = Math.ceil(fullText.length / 4);
      callbacks.onStats({
        promptTokens: 0,
        completionTokens: approxTokens,
        totalTokens: approxTokens,
        tokensPerSec: approxTokens / (elapsedMs / 1000),
        elapsedMs,
      });
    }

    return fullText;
  } finally {
    clearTimeout(timer);
  }
}
