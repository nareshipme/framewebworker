export type {
  ClipInput,
  CaptionSegment,
  CaptionStyle,
  CaptionStylePreset,
  AspectRatio,
  CropOptions,
  CaptionOptions,
  RenderOptions,
  StitchOptions,
  ClipStatus,
  ClipProgress,
  RichProgress,
  EncodeOptions,
  FrameData,
  RendererBackend,
  FrameWorkerConfig,
  FrameWorker,
} from './types.js';

export { STYLE_PRESETS } from './captions.js';
export { FFmpegBackend, createFFmpegBackend } from './backends/ffmpeg.js';

import type { ClipInput, RenderOptions, StitchOptions, FrameWorkerConfig, FrameWorker, RendererBackend } from './types.js';
import { extractFrames } from './compositor.js';
import { stitchClips } from './stitch.js';

export function createFrameWorker(config: FrameWorkerConfig = {}): FrameWorker {
  const fps = config.fps ?? 30;
  const width = config.width ?? 1280;
  const height = config.height ?? 720;

  let _backend: RendererBackend | null = config.backend ?? null;

  async function getBackend(): Promise<RendererBackend> {
    if (!_backend) {
      const { createFFmpegBackend } = await import('./backends/ffmpeg.js');
      _backend = createFFmpegBackend();
    }
    await _backend.init();
    return _backend;
  }

  async function render(clip: ClipInput, options: RenderOptions = {}): Promise<Blob> {
    const mergedOpts: RenderOptions = { fps, width, height, ...options };
    const backend = await getBackend();

    const onProgress = mergedOpts.onProgress;
    const frames = await extractFrames(clip, {
      ...mergedOpts,
      onProgress: onProgress ? (p) => onProgress(p * 0.85) : undefined,
    });

    return backend.encode(frames, {
      width: mergedOpts.width ?? width,
      height: mergedOpts.height ?? height,
      fps: mergedOpts.fps ?? fps,
      mimeType: mergedOpts.mimeType ?? 'video/mp4',
      quality: mergedOpts.quality ?? 0.92,
      encoderOptions: mergedOpts.encoderOptions,
      onProgress: onProgress ? (p) => onProgress(0.85 + p * 0.15) : undefined,
      signal: mergedOpts.signal,
    });
  }

  async function renderToUrl(clip: ClipInput, options?: RenderOptions): Promise<string> {
    const blob = await render(clip, options);
    return URL.createObjectURL(blob);
  }

  async function stitch(clips: ClipInput[], options: StitchOptions = {}): Promise<Blob> {
    const mergedOpts: StitchOptions = { fps, width, height, ...options };
    const backend = await getBackend();
    return stitchClips(clips, backend, mergedOpts);
  }

  async function stitchToUrl(clips: ClipInput[], options?: StitchOptions): Promise<string> {
    const blob = await stitch(clips, options);
    return URL.createObjectURL(blob);
  }

  return { render, renderToUrl, stitch, stitchToUrl };
}
