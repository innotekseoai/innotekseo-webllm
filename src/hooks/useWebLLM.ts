/**
 * React hook for WebLLM model lifecycle
 *
 * Manages loading, inference, and unloading of browser-side
 * GPU models via WebLLM.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  loadModel,
  unloadModel,
  isModelLoaded,
  getCurrentModelId,
  supportsWebGPU,
  AVAILABLE_MODELS,
} from '@/lib/webllm/engine';
import { analyzePageForGeo } from '@/lib/webllm/analyzer';
import type { GeoPageAnalysis } from '@/types/analysis';

interface WebLLMState {
  isLoading: boolean;
  isReady: boolean;
  isAnalyzing: boolean;
  loadProgress: { text: string; progress: number };
  error: string | null;
  hasWebGPU: boolean;
  currentModel: string | null;
}

export function useWebLLM() {
  const [state, setState] = useState<WebLLMState>({
    isLoading: false,
    isReady: isModelLoaded(),
    isAnalyzing: false,
    loadProgress: { text: '', progress: 0 },
    error: null,
    hasWebGPU: false,
    currentModel: getCurrentModelId(),
  });

  // Check WebGPU support on mount
  useEffect(() => {
    setState((s) => ({ ...s, hasWebGPU: supportsWebGPU() }));
  }, []);

  const load = useCallback(async (modelId: string) => {
    setState((s) => ({ ...s, isLoading: true, error: null, loadProgress: { text: 'Initializing...', progress: 0 } }));

    try {
      await loadModel(modelId, (progress) => {
        setState((s) => ({ ...s, loadProgress: progress }));
      });
      setState((s) => ({
        ...s,
        isLoading: false,
        isReady: true,
        currentModel: modelId,
        loadProgress: { text: 'Ready', progress: 1 },
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        isReady: false,
        error: err instanceof Error ? err.message : 'Failed to load model',
      }));
    }
  }, []);

  const unload = useCallback(async () => {
    await unloadModel();
    setState((s) => ({
      ...s,
      isReady: false,
      currentModel: null,
      loadProgress: { text: '', progress: 0 },
    }));
  }, []);

  const analyzePage = useCallback(
    async (url: string, markdown: string, baseUrl: string, onProgress?: (msg: string) => void): Promise<GeoPageAnalysis> => {
      setState((s) => ({ ...s, isAnalyzing: true }));
      try {
        const result = await analyzePageForGeo({ url, markdown, baseUrl, onProgress });
        return result;
      } finally {
        setState((s) => ({ ...s, isAnalyzing: false }));
      }
    },
    [],
  );

  return {
    ...state,
    load,
    unload,
    analyzePage,
    availableModels: AVAILABLE_MODELS,
  };
}
