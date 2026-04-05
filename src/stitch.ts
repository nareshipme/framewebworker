import type { ClipInput, RenderOptions, RendererBackend } from './types.js';
import { extractFrames } from './compositor.js';

export async function stitchClips(
  clips: ClipInput[],
  backend: RendererBackend,
  options: RenderOptions
): Promise<Blob> {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const onProgress = options.onProgress;

  const blobs: Blob[] = [];

  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci];
    const clipProgress = (p: number) => {
      onProgress?.(((ci + p * 0.9) / clips.length));
    };

    const frames = await extractFrames(clip, {
      ...options,
      width,
      height,
      fps,
      onProgress: clipProgress,
    });

    const blob = await backend.encode(frames, {
      width,
      height,
      fps,
      mimeType: options.mimeType ?? 'video/mp4',
      quality: options.quality ?? 0.92,
      encoderOptions: options.encoderOptions,
      onProgress: (p) => clipProgress(0.9 + p * 0.1),
      signal: options.signal,
    });

    blobs.push(blob);
  }

  if (blobs.length === 1) {
    onProgress?.(1);
    return blobs[0];
  }

  return backend.concat(blobs, {
    width,
    height,
    fps,
    mimeType: options.mimeType ?? 'video/mp4',
    quality: options.quality ?? 0.92,
    onProgress: (p) => onProgress?.((clips.length - 1 + p) / clips.length),
    signal: options.signal,
  });
}
