import type { ClipInput, FrameData, RenderOptions } from './types.js';
import { STYLE_PRESETS, mergeStyle, getActiveCaptions, renderCaption } from './captions.js';

const ASPECT_RATIO_MAP: Record<string, [number, number]> = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:3': [4, 3],
  '3:4': [3, 4],
  original: [0, 0],
};

function resolveOutputDimensions(
  clip: ClipInput,
  videoWidth: number,
  videoHeight: number,
  options: RenderOptions
): [number, number] {
  const ar = clip.aspectRatio ?? 'original';
  const ratio = ASPECT_RATIO_MAP[ar] ?? [0, 0];

  if (ratio[0] === 0) {
    return [options.width ?? videoWidth, options.height ?? videoHeight];
  }

  const w = options.width ?? 1280;
  const h = Math.round(w * (ratio[1] / ratio[0]));
  return [w, h];
}

export async function extractFrames(
  clip: ClipInput,
  options: RenderOptions
): Promise<FrameData[]> {
  const fps = options.fps ?? 30;
  const onProgress = options.onProgress;
  const signal = options.signal;

  let srcUrl: string;
  let needsRevoke = false;

  if (typeof clip.source === 'string') {
    srcUrl = clip.source;
  } else if (clip.source instanceof HTMLVideoElement) {
    srcUrl = clip.source.src;
  } else {
    srcUrl = URL.createObjectURL(clip.source as Blob);
    needsRevoke = true;
  }

  const video = document.createElement('video');
  video.muted = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(`Failed to load video: ${srcUrl}`));
    video.src = srcUrl;
  });

  const duration = video.duration;
  const startTime = clip.startTime ?? 0;
  const endTime = clip.endTime ?? duration;
  const clipDuration = endTime - startTime;

  const [outW, outH] = resolveOutputDimensions(
    clip,
    video.videoWidth,
    video.videoHeight,
    options
  );

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const totalFrames = Math.ceil(clipDuration * fps);
  const frames: FrameData[] = [];

  const captionSegments = clip.captions?.segments ?? [];
  const baseStylePreset = clip.captions?.style?.preset ?? 'modern';
  const baseStyle = mergeStyle(
    STYLE_PRESETS[baseStylePreset],
    clip.captions?.style
  );

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');

    const t = startTime + (i / fps);

    await seekVideo(video, t);
    ctx.clearRect(0, 0, outW, outH);

    drawVideoFrame(ctx, video, clip, outW, outH);

    if (captionSegments.length > 0) {
      const active = getActiveCaptions(captionSegments, t - startTime);
      for (const seg of active) {
        const segStyle = mergeStyle(baseStyle, seg.style);
        renderCaption(ctx, seg, segStyle, outW, outH);
      }
    }

    const imageData = ctx.getImageData(0, 0, outW, outH);
    frames.push({ imageData, timestamp: t - startTime, width: outW, height: outH });

    if (onProgress) onProgress(i / totalFrames);
  }

  if (needsRevoke) URL.revokeObjectURL(srcUrl);

  return frames;
}

function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  clip: ClipInput,
  outW: number,
  outH: number
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (clip.crop) {
    const { x, y, width, height } = clip.crop;
    ctx.drawImage(
      video,
      x * vw, y * vh, width * vw, height * vh,
      0, 0, outW, outH
    );
  } else {
    const videoAR = vw / vh;
    const outAR = outW / outH;

    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoAR > outAR) {
      sw = vh * outAR;
      sx = (vw - sw) / 2;
    } else if (videoAR < outAR) {
      sh = vw / outAR;
      sy = (vh - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
  }
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}
