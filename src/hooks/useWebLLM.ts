/**
 * React hook for WebLLM model lifecycle
 *
 * Manages loading, downloading, cache status, and inference
 * of browser-side GPU models via WebLLM.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadModel,
  unloadModel,
  downloadModel,
  isModelLoaded,
  isModelCached,
  deleteModelFromCache,
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
  /** Map of modelId → cached status. Starts empty, populated async on mount. */
  cacheStatus: Record<string, boolean>;
  /** Model currently being downloaded (download-only, not load). */
  downloadingModel: string | null;
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
    cacheStatus: {},
    downloadingModel: null,
  });

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Check WebGPU support + cache status on mount
  useEffect(() => {
    setState((s) => ({ ...s, hasWebGPU: supportsWebGPU() }));
    refreshCacheStatus();
  }, []);

  /**
   * Probe cache status for all available models.
   */
  const refreshCacheStatus = useCallback(async () => {
    const status: Record<string, boolean> = {};
    await Promise.all(
      AVAILABLE_MODELS.map(async (m) => {
        status[m.id] = await isModelCached(m.id);
      }),
    );
    if (mountedRef.current) {
      setState((s) => ({ ...s, cacheStatus: status }));
    }
  }, []);

  /**
   * Load a model for inference (downloads if not cached).
   */
  const load = useCallback(async (modelId: string) => {
    setState((s) => ({ ...s, isLoading: true, error: null, loadProgress: { text: 'Initializing...', progress: 0 } }));

    try {
      await loadModel(modelId, (progress) => {
        if (mountedRef.current) {
          setState((s) => ({ ...s, loadProgress: progress }));
        }
      });
      setState((s) => ({
        ...s,
        isLoading: false,
        isReady: true,
        currentModel: modelId,
        loadProgress: { text: 'Ready', progress: 1 },
        cacheStatus: { ...s.cacheStatus, [modelId]: true },
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

  /**
   * Download a model to cache without loading for inference.
   * Frees GPU memory immediately after download completes.
   */
  const download = useCallback(async (modelId: string) => {
    setState((s) => ({
      ...s,
      downloadingModel: modelId,
      error: null,
      loadProgress: { text: 'Initializing download...', progress: 0 },
    }));

    try {
      await downloadModel(modelId, (progress) => {
        if (mountedRef.current) {
          setState((s) => ({ ...s, loadProgress: progress }));
        }
      });
      setState((s) => ({
        ...s,
        downloadingModel: null,
        loadProgress: { text: 'Download complete', progress: 1 },
        cacheStatus: { ...s.cacheStatus, [modelId]: true },
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        downloadingModel: null,
        error: err instanceof Error ? err.message : 'Download failed',
      }));
    }
  }, []);

  /**
   * Delete a specific model from browser cache.
   */
  const deleteModel = useCallback(async (modelId: string) => {
    try {
      await deleteModelFromCache(modelId);
      setState((s) => ({
        ...s,
        cacheStatus: { ...s.cacheStatus, [modelId]: false },
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Failed to delete model',
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
    download,
    deleteModel,
    refreshCacheStatus,
    analyzePage,
    availableModels: AVAILABLE_MODELS,
    /** Convenience: true when any async model operation is in progress */
    isBusy: state.isLoading || state.downloadingModel !== null,
  };
}
