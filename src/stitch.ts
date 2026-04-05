import type { ClipInput, RendererBackend, FrameData, ClipProgress, StitchOptions } from './types.js';
import { extractFrames } from './compositor.js';
import { WorkerPool } from './worker/pool.js';

function supportsOffscreenWorkers(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  );
}

export async function stitchClips(
  clips: ClipInput[],
  backend: RendererBackend,
  options: StitchOptions
): Promise<Blob> {
  if (supportsOffscreenWorkers() && clips.length > 1) {
    return stitchParallel(clips, backend, options);
  }
  return stitchSequential(clips, backend, options);
}

// ── Sequential fallback (older browsers / single clip) ────────────────────────

async function stitchSequential(
  clips: ClipInput[],
  backend: RendererBackend,
  options: StitchOptions
): Promise<Blob> {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const { onProgress, signal } = options;

  const clipStatuses: ClipProgress[] = clips.map((_, i) => ({
    index: i, status: 'pending', progress: 0,
  }));

  const emit = (overall: number) => {
    onProgress?.({ overall, clips: clipStatuses.slice() });
  };

  const blobs: Blob[] = [];

  for (let ci = 0; ci < clips.length; ci++) {
    clipStatuses[ci].status = 'rendering';
    emit(ci / clips.length);

    const frames = await extractFrames(clips[ci], {
      fps, width, height,
      mimeType: options.mimeType,
      quality: options.quality,
      encoderOptions: options.encoderOptions,
      signal,
      onProgress: (p) => {
        clipStatuses[ci].progress = p * 0.9;
        emit((ci + p * 0.9) / clips.length);
      },
    });

    clipStatuses[ci].status = 'encoding';
    const blob = await backend.encode(frames, {
      width, height, fps,
      mimeType: options.mimeType ?? 'video/mp4',
      quality: options.quality ?? 0.92,
      encoderOptions: options.encoderOptions,
      signal,
      onProgress: (p) => {
        clipStatuses[ci].progress = 0.9 + p * 0.1;
        emit((ci + 0.9 + p * 0.1) / clips.length);
      },
    });

    clipStatuses[ci].status = 'done';
    clipStatuses[ci].progress = 1;
    blobs.push(blob);
  }

  if (blobs.length === 1) { emit(1); return blobs[0]; }

  return backend.concat(blobs, {
    width, height, fps,
    mimeType: options.mimeType ?? 'video/mp4',
    quality: options.quality ?? 0.92,
    signal,
    onProgress: (p) => emit((clips.length - 1 + p) / clips.length),
  });
}

// ── Parallel path (OffscreenCanvas + WorkerPool) ──────────────────────────────

async function stitchParallel(
  clips: ClipInput[],
  backend: RendererBackend,
  options: StitchOptions
): Promise<Blob> {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const { onProgress, signal } = options;

  const concurrency = Math.min(
    clips.length,
    (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2),
    4
  );

  const clipStatuses: ClipProgress[] = clips.map((_, i) => ({
    index: i, status: 'pending', progress: 0,
  }));

  const emit = () => {
    const overall = clipStatuses.reduce((sum, c) => sum + c.progress, 0) / clips.length;
    onProgress?.({ overall, clips: clipStatuses.slice() });
  };

  const pool = new WorkerPool(concurrency);

  // blobs[ci] filled as soon as clip ci finishes encoding
  const blobs: Blob[] = new Array(clips.length);

  // ffmpeg.wasm is single-instance — serialise encoding while extraction runs in parallel
  let encodeChain = Promise.resolve();

  try {
    await Promise.all(
      clips.map(async (clip, ci) => {
        clipStatuses[ci].status = 'rendering';
        emit();

        const frames: FrameData[] = await pool.dispatch(
          clip, width, height, fps, signal,
          (p) => {
            clipStatuses[ci].progress = p * 0.85;
            emit();
          }
        );

        clipStatuses[ci].status = 'encoding';
        clipStatuses[ci].progress = 0.85;
        emit();

        // Queue behind any in-progress encode; await until THIS clip's encode completes
        await new Promise<void>((resolve, reject) => {
          encodeChain = encodeChain.then(async () => {
            try {
              blobs[ci] = await backend.encode(frames, {
                width, height, fps,
                mimeType: options.mimeType ?? 'video/mp4',
                quality: options.quality ?? 0.92,
                encoderOptions: options.encoderOptions,
                signal,
                onProgress: (p) => {
                  clipStatuses[ci].progress = 0.85 + p * 0.15;
                  emit();
                },
              });
              clipStatuses[ci].status = 'done';
              clipStatuses[ci].progress = 1;
              emit();
              resolve();
            } catch (err) {
              clipStatuses[ci].status = 'error';
              reject(err);
              throw err;
            }
          });
        });
      })
    );

    if (blobs.length === 1) {
      onProgress?.({ overall: 1, clips: clipStatuses.slice() });
      return blobs[0];
    }

    return backend.concat(blobs, {
      width, height, fps,
      mimeType: options.mimeType ?? 'video/mp4',
      quality: options.quality ?? 0.92,
      signal,
    });
  } finally {
    pool.terminate();
  }
}
