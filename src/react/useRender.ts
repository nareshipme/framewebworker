'use client';

import { useState, useCallback, useRef } from 'react';
import type { ClipInput, RenderOptions, FrameWorker } from '../types.js';
import type { Segment, SingleVideoRenderOptions, RichProgress, RenderMetrics } from '../types.js';
import { render as renderSegments } from '../render.js';

// ── useClipRender — wraps FrameWorker.render(clip) ───────────────────────────

export interface UseClipRenderState {
  progress: number;
  isRendering: boolean;
  error: Error | null;
  blob: Blob | null;
  url: string | null;
}

export interface UseClipRenderActions {
  render: (clip: ClipInput, options?: Omit<RenderOptions, 'onProgress' | 'signal'>) => Promise<Blob | null>;
  cancel: () => void;
  reset: () => void;
}

export type UseClipRenderResult = UseClipRenderState & UseClipRenderActions;

export function useClipRender(frameWorker: FrameWorker): UseClipRenderResult {
  const [state, setState] = useState<UseClipRenderState>({
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

  const render = useCallback(
    async (
      clip: ClipInput,
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
        const blob = await frameWorker.render(clip, {
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

  return { ...state, render, cancel, reset };
}

// ── useRender — single-video multi-segment API ────────────────────────────────

export interface UseRenderResult {
  start: () => void;
  cancel: () => void;
  progress: RichProgress | null;
  metrics: RenderMetrics | null;
  url: string | null;
  error: Error | null;
  isRendering: boolean;
}

export function useRender(
  videoUrl: string | null,
  segments: Segment[],
  options?: Omit<SingleVideoRenderOptions, 'onProgress' | 'onComplete' | 'signal'>
): UseRenderResult {
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState<RichProgress | null>(null);
  const [metrics, setMetrics] = useState<RenderMetrics | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    if (!videoUrl || isRendering) return;

    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsRendering(true);
    setProgress(null);
    setMetrics(null);
    setUrl(null);
    setError(null);

    renderSegments(videoUrl, segments, {
      ...options,
      signal: controller.signal,
      onProgress: (p) => setProgress(p),
      onComplete: (m) => setMetrics(m),
    }).then(({ blob }) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef.current = objectUrl;
      setUrl(objectUrl);
      setIsRendering(false);
    }).catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setIsRendering(false);
        return;
      }
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsRendering(false);
    });
  }, [videoUrl, segments, options, isRendering]);

  return { start, cancel, progress, metrics, url, error, isRendering };
}
