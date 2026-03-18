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

/**
 * Run chat completion with the loaded model.
 * Includes a timeout to prevent indefinite hangs on GPU errors.
 * Resets the chat session before each call to avoid context buildup.
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (!engine) throw new Error('No model loaded');

  // Reset chat state between calls — prevents context window overflow
  // and clears any corrupted state from prior WebGPU errors
  await engine.resetChat();

  // Race the inference against a timeout
  const result = await Promise.race([
    engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 400,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Inference timeout (30s) — GPU may be overloaded')), INFERENCE_TIMEOUT_MS),
    ),
  ]);

  return result.choices[0]?.message?.content ?? '';
}
