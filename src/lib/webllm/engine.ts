/**
 * WebLLM engine singleton
 *
 * Manages browser-side GPU inference via @mlc-ai/web-llm.
 * Models are automatically cached in IndexedDB by the WebLLM runtime.
 */

import type { MLCEngine } from '@mlc-ai/web-llm';

export interface WebLLMModel {
  id: string;
  label: string;
  sizeHint: string;
}

export const AVAILABLE_MODELS: WebLLMModel[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen 2.5 0.5B (Fast)',
    sizeHint: '~350MB',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen 2.5 1.5B (Recommended)',
    sizeHint: '~1GB',
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f32_1-MLC',
    label: 'SmolLM2 360M (Smallest)',
    sizeHint: '~200MB',
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
 * Load a WebLLM model. Downloads on first use, instant from cache after.
 */
export async function loadModel(
  modelId: string,
  onProgress?: (progress: { text: string; progress: number }) => void,
): Promise<void> {
  if (engine && currentModelId === modelId) return;

  // Unload previous if different
  if (engine) {
    await unloadModel();
  }

  // Dynamic import to avoid SSR issues
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
 * Unload the current model and free resources.
 */
export async function unloadModel(): Promise<void> {
  if (engine) {
    await engine.unload();
    engine = null;
    currentModelId = null;
  }
}

/**
 * Get the current engine instance.
 */
export function getEngine(): MLCEngine | null {
  return engine;
}

/**
 * Check if a model is currently loaded.
 */
export function isModelLoaded(): boolean {
  return engine !== null;
}

/**
 * Get the currently loaded model ID.
 */
export function getCurrentModelId(): string | null {
  return currentModelId;
}

/**
 * Run chat completion with the loaded model.
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (!engine) throw new Error('No model loaded');

  const reply = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1024,
  });

  return reply.choices[0]?.message?.content ?? '';
}
