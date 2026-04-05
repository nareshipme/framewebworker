'use client';

import { useState, useCallback, useRef } from 'react';
import type { Segment, ExportOptions, RichProgress, RenderMetrics } from '../types.js';
import { exportClips } from '../render.js';

export interface UseExportClipsResult {
  start: () => void;
  cancel: () => void;
  isRendering: boolean;
  progress: RichProgress | null;
  metrics: RenderMetrics | null;
  url: string | null;
  error: Error | null;
}

export function useExportClips(
  videoUrl: string | null,
  segments: Segment[],
  options?: Omit<ExportOptions, 'onProgress' | 'onComplete' | 'signal'>
): UseExportClipsResult {
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

    exportClips(videoUrl, segments, {
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

  return { start, cancel, isRendering, progress, metrics, url, error };
}
