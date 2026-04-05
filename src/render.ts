import type { Segment, SingleVideoRenderOptions, RenderMetrics, ClipInput } from './types.js';
import { stitchClips } from './stitch.js';
import { createFFmpegBackend } from './backends/ffmpeg.js';

function segmentsToClips(videoUrl: string, segments: Segment[]): ClipInput[] {
  return segments.map((seg) => ({
    source: videoUrl,
    startTime: seg.start,
    endTime: seg.end,
    captions: seg.captions?.length ? { segments: seg.captions } : undefined,
  }));
}

export async function render(
  videoUrl: string,
  segments: Segment[],
  options?: SingleVideoRenderOptions
): Promise<{ blob: Blob; metrics: RenderMetrics }> {
  const clips = segmentsToClips(videoUrl, segments);
  const backend = createFFmpegBackend();
  await backend.init();
  return stitchClips(clips, backend, options ?? {});
}

export async function renderToUrl(
  videoUrl: string,
  segments: Segment[],
  options?: SingleVideoRenderOptions
): Promise<{ url: string; metrics: RenderMetrics }> {
  const { blob, metrics } = await render(videoUrl, segments, options);
  return { url: URL.createObjectURL(blob), metrics };
}
