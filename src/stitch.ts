import type { ClipInput, FrameData, RendererBackend, ClipStatus, RichProgress } from './types.js';
import type { StitchOptions } from './types.js';
import { WorkerPool } from './worker/pool.js';
import { extractFrames } from './compositor.js';

export async function stitchClips(
  clips: ClipInput[],
  backend: RendererBackend,
  options: StitchOptions
): Promise<Blob> {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const onProgress = options.onProgress;

  // Fall back to sequential path if OffscreenCanvas / Worker not available
  if (!('OffscreenCanvas' in globalThis) || !('Worker' in globalThis)) {
    return sequentialStitch(clips, backend, options, fps, width, height);
  }

  const concurrency = Math.min(clips.length, navigator.hardwareConcurrency || 2, 4);
  const pool = new WorkerPool(concurrency);

  const clipStatuses: ClipStatus[] = clips.map(() => 'queued');
  const clipProgresses: number[] = clips.map(() => 0);

  const emitProgress = () => {
    if (!onProgress) return;
    const overall = clipProgresses.reduce((a, b) => a + b, 0) / clips.length;
    const clipData = clips.map((_, i) => ({
      index: i,
      status: clipStatuses[i],
      progress: clipProgresses[i],
    }));
    onProgress({ overall, clips: clipData });
  };

  try {
    // Phase 1: render all clips in parallel (limited by pool concurrency)
    const frameArrays: FrameData[][] = await Promise.all(
      clips.map(async (clip, i) => {
        clipStatuses[i] = 'rendering';
        emitProgress();
        try {
          const frames = await pool.dispatch(
            `clip-${i}`,
            clip,
            { fps, width, height, signal: options.signal },
            (current, total) => {
              clipProgresses[i] = current / total;
              emitProgress();
            }
          );
          return frames;
        } catch (err) {
          clipStatuses[i] = 'failed';
          emitProgress();
          throw err;
        }
      })
    );

    // Phase 2: encode each clip sequentially (FFmpeg.wasm is single-instance)
    const blobs: Blob[] = [];
    for (let i = 0; i < frameArrays.length; i++) {
      const blob = await backend.encode(frameArrays[i], {
        width,
        height,
        fps,
        mimeType: options.mimeType ?? 'video/mp4',
        quality: options.quality ?? 0.92,
        encoderOptions: options.encoderOptions,
        signal: options.signal,
      });
      clipStatuses[i] = 'done';
      clipProgresses[i] = 1;
      emitProgress();
      blobs.push(blob);
    }

    if (blobs.length === 1) {
      onProgress?.({
        overall: 1,
        clips: clips.map((_, i) => ({ index: i, status: 'done', progress: 1 })),
      });
      return blobs[0];
    }

    return backend.concat(blobs, {
      width,
      height,
      fps,
      mimeType: options.mimeType ?? 'video/mp4',
      quality: options.quality ?? 0.92,
      signal: options.signal,
    });
  } finally {
    pool.terminate();
  }
}

async function sequentialStitch(
  clips: ClipInput[],
  backend: RendererBackend,
  options: StitchOptions,
  fps: number,
  width: number,
  height: number
): Promise<Blob> {
  const onProgress = options.onProgress;
  const blobs: Blob[] = [];

  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci];

    const emitClipProgress = (p: number) => {
      if (!onProgress) return;
      const overall = (ci + p) / clips.length;
      onProgress({
        overall,
        clips: clips.map((_, i) => ({
          index: i,
          status: i < ci ? 'done' : i === ci ? 'rendering' : 'queued',
          progress: i < ci ? 1 : i === ci ? p : 0,
        })),
      });
    };

    const frames = await extractFrames(clip, {
      ...options,
      width,
      height,
      fps,
      onProgress: (p) => emitClipProgress(p * 0.9),
    });

    const blob = await backend.encode(frames, {
      width,
      height,
      fps,
      mimeType: options.mimeType ?? 'video/mp4',
      quality: options.quality ?? 0.92,
      encoderOptions: options.encoderOptions,
      onProgress: (p) => emitClipProgress(0.9 + p * 0.1),
      signal: options.signal,
    });

    blobs.push(blob);
  }

  if (blobs.length === 1) {
    onProgress?.({
      overall: 1,
      clips: clips.map((_, i) => ({ index: i, status: 'done', progress: 1 })),
    });
    return blobs[0];
  }

  return backend.concat(blobs, {
    width,
    height,
    fps,
    mimeType: options.mimeType ?? 'video/mp4',
    quality: options.quality ?? 0.92,
    signal: options.signal,
  });
}
