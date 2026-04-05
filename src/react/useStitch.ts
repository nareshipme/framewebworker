'use client';

import { useState, useCallback, useRef } from 'react';
import type { ClipInput, RenderOptions, FrameWorker } from '../types.js';

export interface UseStitchState {
  progress: number;
  isRendering: boolean;
  error: Error | null;
  blob: Blob | null;
  url: string | null;
}

export interface UseStitchActions {
  stitch: (clips: ClipInput[], options?: Omit<RenderOptions, 'onProgress' | 'signal'>) => Promise<Blob | null>;
  cancel: () => void;
  reset: () => void;
}

export type UseStitchResult = UseStitchState & UseStitchActions;

export function useStitch(frameWorker: FrameWorker): UseStitchResult {
  const [state, setState] = useState<UseStitchState>({
    progress: 0,
    isRendering: false,
    error: null,
    blob: null,
    url: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setState({ progress: 0, isRendering: false, error: null, blob: null, url: null });
  }, []);

  const stitch = useCallback(
    async (
      clips: ClipInput[],
      options?: Omit<RenderOptions, 'onProgress' | 'signal'>
    ): Promise<Blob | null> => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setState({ progress: 0, isRendering: true, error: null, blob: null, url: null });

      try {
        const blob = await frameWorker.stitch(clips, {
          ...options,
          signal: controller.signal,
          onProgress: (p) => {
            setState((prev) => ({ ...prev, progress: p }));
          },
        });

        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setState({ progress: 1, isRendering: false, error: null, blob, url });
        return blob;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setState((prev) => ({ ...prev, isRendering: false, error: null }));
          return null;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, isRendering: false, error }));
        return null;
      }
    },
    [frameWorker]
  );

  return { ...state, stitch, cancel, reset };
}
