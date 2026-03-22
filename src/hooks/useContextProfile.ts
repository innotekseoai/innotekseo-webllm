'use client';

import { useState, useCallback } from 'react';
import {
  CONTEXT_CONFIG,
  type ContextProfile,
  type ContextConfig,
  readContextProfileOverride,
  writeContextProfileOverride,
} from '@/lib/config/context';
import { useWebLLM } from './useWebLLM';

export interface ContextProfileState {
  /** Resolved profile in use */
  profile: ContextProfile;
  /** Full config values for the resolved profile */
  config: ContextConfig;
  /** True when profile was auto-selected (no manual override) */
  isAuto: boolean;
  /** True when the currently loaded model has the xl tag */
  isXlModel: boolean;
  /** Raw override stored in localStorage (null = auto) */
  override: ContextProfile | null;
  /** Set or clear the manual override */
  setProfile: (p: ContextProfile | null) => void;
}

export function useContextProfile(): ContextProfileState {
  const webllm = useWebLLM();
  const [override, setOverrideState] = useState<ContextProfile | null>(
    readContextProfileOverride,
  );

  const isXlModel =
    webllm.availableModels
      .find((m) => m.id === webllm.currentModel)
      ?.tags.includes('xl') ?? false;

  const profile: ContextProfile = override ?? (isXlModel ? 'large' : 'standard');
  const config: ContextConfig = CONTEXT_CONFIG[profile];
  const isAuto = override === null;

  const setProfile = useCallback((p: ContextProfile | null) => {
    writeContextProfileOverride(p);
    setOverrideState(p);
  }, []);

  return { profile, config, isAuto, isXlModel, override, setProfile };
}
