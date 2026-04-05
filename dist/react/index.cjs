'use strict';

var react = require('react');

// src/react/useRender.ts
function useRender(frameWorker) {
  const [state, setState] = react.useState({
    progress: 0,
    isRendering: false,
    error: null,
    blob: null,
    url: null
  });
  const abortRef = react.useRef(null);
  const urlRef = react.useRef(null);
  const cancel = react.useCallback(() => {
    abortRef.current?.abort();
  }, []);
  const reset = react.useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setState({ progress: 0, isRendering: false, error: null, blob: null, url: null });
  }, []);
  const render = react.useCallback(
    async (clip, options) => {
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
          }
        });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setState({ progress: 1, isRendering: false, error: null, blob, url });
        return blob;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
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
function useStitch(frameWorker) {
  const [state, setState] = react.useState({
    progress: 0,
    isRendering: false,
    error: null,
    blob: null,
    url: null
  });
  const abortRef = react.useRef(null);
  const urlRef = react.useRef(null);
  const cancel = react.useCallback(() => {
    abortRef.current?.abort();
  }, []);
  const reset = react.useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setState({ progress: 0, isRendering: false, error: null, blob: null, url: null });
  }, []);
  const stitch = react.useCallback(
    async (clips, options) => {
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
          }
        });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setState({ progress: 1, isRendering: false, error: null, blob, url });
        return blob;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
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

exports.useRender = useRender;
exports.useStitch = useStitch;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map