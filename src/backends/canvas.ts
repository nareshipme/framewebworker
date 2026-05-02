import type { ClipSource, MergeOptions, RenderMetrics, ClipMetrics, ClipProgress } from '../types.js';
import { STYLE_PRESETS, mergeStyle, getActiveCaptions, renderCaption } from '../captions.js';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
}

const ASPECT_RATIO_MAP: Record<string, [number, number]> = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:3': [4, 3],
  '3:4': [3, 4],
  original: [0, 0],
};

interface Layout {
  canvasW: number;
  canvasH: number;
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
}

const MEDIUM_MAX_SHORT_SIDE = 720;

function computeLayout(clip: ClipSource, videoW: number, videoH: number): Layout {
  const ar = clip.aspectRatio ?? 'original';
  const ratio = ASPECT_RATIO_MAP[ar] ?? [0, 0];
  let canvasW = ratio[0] === 0 ? videoW : 1280;
  let canvasH = ratio[0] === 0 ? videoH : Math.round(canvasW * (ratio[1] / ratio[0]));

  if (clip.quality === 'medium') {
    const shortSide = Math.min(canvasW, canvasH);
    if (shortSide > MEDIUM_MAX_SHORT_SIDE) {
      const scale = MEDIUM_MAX_SHORT_SIDE / shortSide;
      canvasW = Math.round(canvasW * scale);
      canvasH = Math.round(canvasH * scale);
    }
  }

  if (clip.crop) {
    const { x, y, width, height } = clip.crop;
    return {
      canvasW,
      canvasH,
      srcX: x * videoW,
      srcY: y * videoH,
      srcW: width * videoW,
      srcH: height * videoH,
    };
  }

  const outAR = canvasW / canvasH;
  const srcAR = videoW / videoH;
  let srcX = 0, srcY = 0, srcW = videoW, srcH = videoH;
  if (srcAR > outAR) {
    srcW = videoH * outAR;
    srcX = (videoW - srcW) / 2;
  } else if (srcAR < outAR) {
    srcH = videoW / outAR;
    srcY = (videoH - srcH) / 2;
  }
  return { canvasW, canvasH, srcX, srcY, srcW, srcH };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001) {
      resolve();
      return;
    }
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = time;
  });
}

interface RecordOptions {
  signal?: AbortSignal;
  onProgress?: (p: number) => void;
}

export async function recordClip(
  srcUrl: string,
  clip: ClipSource,
  opts: RecordOptions = {}
): Promise<Blob> {
  const { signal, onProgress } = opts;

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.muted = true;
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
  document.body.appendChild(video);

  // Create AudioContext immediately (close to the user gesture) so resume() succeeds later.
  let audioCtx: AudioContext | null = null;
  try { audioCtx = new AudioContext(); } catch { /* not supported */ }

  // Pause/resume the video when the tab is hidden so the browser doesn't stall
  // recording mid-clip. The recorder keeps running (frozen frame) — acceptable for
  // single clips which are short.
  function onVisibilityChangeSingle() {
    if (document.hidden) {
      video.pause();
    } else {
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChangeSingle);

  try {
    await new Promise<void>((resolve, reject) => {
      // canplaythrough = browser has buffered enough to play without stalling.
      // This prevents the video from pausing mid-record on remote/S3 sources.
      video.addEventListener('canplaythrough', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error(`Failed to load video: ${srcUrl}`)), {
        once: true,
      });
      video.preload = 'auto';
      video.src = srcUrl;
      video.load();
    });

    const startTime = clip.startTime ?? 0;
    const endTime = clip.endTime ?? video.duration;
    const duration = endTime - startTime;

    await seekTo(video, startTime);
    if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');

    const { canvasW, canvasH, srcX, srcY, srcW, srcH } = computeLayout(
      clip,
      video.videoWidth,
      video.videoHeight
    );

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    const canvasStream = canvas.captureStream(30);

    // Unmute so audio data flows through the Web Audio graph (some browsers silence
    // createMediaElementSource output when the element's muted flag is true).
    video.muted = false;

    if (audioCtx) {
      try {
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const audioSrc = audioCtx.createMediaElementSource(video);
        const audioDest = audioCtx.createMediaStreamDestination();
        const gain = audioCtx.createGain();
        gain.gain.value = clip.volume ?? 1;
        audioSrc.connect(gain);
        gain.connect(audioDest);
        audioDest.stream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
      } catch {
        // CORS restriction or other error — continue video-only
      }
    }

    const mimeType = pickMimeType();
    const recorderInit: MediaRecorderOptions = { mimeType };
    if (clip.quality === 'medium') recorderInit.videoBitsPerSecond = 2_500_000;
    const recorder = new MediaRecorder(canvasStream, recorderInit);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const captionSegs = clip.captions?.segments ?? [];
    const baseStyle = mergeStyle(
      STYLE_PRESETS[clip.captions?.style?.preset ?? 'modern'],
      clip.captions?.style
    );

    // requestVideoFrameCallback fires per decoded frame and is NOT throttled in
    // background tabs, unlike requestAnimationFrame.
    const supportsRVFC = 'requestVideoFrameCallback' in video;

    return await new Promise<Blob>((resolve, reject) => {
      let frameHandle = 0;
      // eslint-disable-next-line prefer-const
      let intervalId: ReturnType<typeof setInterval>;
      let aborted = false;

      function scheduleFrame() {
        if (supportsRVFC) {
          frameHandle = (video as HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number }).requestVideoFrameCallback(drawFrame);
        } else {
          frameHandle = requestAnimationFrame(drawFrame);
        }
      }

      function cancelFrame() {
        if (supportsRVFC) {
          (video as HTMLVideoElement & { cancelVideoFrameCallback(id: number): void }).cancelVideoFrameCallback(frameHandle);
        } else {
          cancelAnimationFrame(frameHandle);
        }
      }

      function stop() {
        cancelFrame();
        clearInterval(intervalId);
        if (recorder.state !== 'inactive') recorder.stop();
        video.pause();
      }

      function drawFrame() {
        ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvasW, canvasH);
        const clipTime = video.currentTime - startTime;
        for (const seg of getActiveCaptions(captionSegs, clipTime)) {
          renderCaption(ctx, seg, mergeStyle(baseStyle, seg.style), canvasW, canvasH);
        }
        if (video.currentTime < endTime) {
          scheduleFrame();
        } else {
          stop();
        }
      }

      recorder.onstop = () => {
        if (!aborted) resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.onerror = () => reject(new Error('Recording failed'));

      recorder.start(100);
      // Try unmuted play; if autoplay policy blocks it, fall back to muted play
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(reject);
      });
      scheduleFrame();

      intervalId = setInterval(() => {
        if (signal?.aborted) {
          aborted = true;
          stop();
          reject(new DOMException('Render cancelled', 'AbortError'));
          return;
        }
        onProgress?.(Math.min((video.currentTime - startTime) / duration, 0.99));
      }, 200);

      video.addEventListener('ended', stop, { once: true });
    });
  } finally {
    document.removeEventListener('visibilitychange', onVisibilityChangeSingle);
    video.remove();
    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }
  }
}

function resolveUrl(clip: ClipSource): { url: string; needsRevoke: boolean } {
  if (typeof clip.source === 'string') return { url: clip.source, needsRevoke: false };
  if (clip.source instanceof HTMLVideoElement) return { url: clip.source.src, needsRevoke: false };
  return { url: URL.createObjectURL(clip.source as Blob), needsRevoke: true };
}

export async function recordClips(
  clips: ClipSource[],
  options: MergeOptions = {}
): Promise<{ blob: Blob; metrics: RenderMetrics }> {
  const { onProgress, onComplete, signal } = options;
  const startAll = performance.now();

  const clipStatuses: ClipProgress[] = clips.map((_, i) => ({
    index: i,
    status: 'pending' as const,
    progress: 0,
  }));
  const clipMetrics: ClipMetrics[] = [];

  let lastOverall = 0;
  function emit(overall: number, paused = false) {
    lastOverall = overall;
    onProgress?.({ overall, clips: clipStatuses.slice(), paused });
  }

  // Single clip: delegate straight to recordClip (produces a single valid stream).
  if (clips.length === 1) {
    const { url, needsRevoke } = resolveUrl(clips[0]);
    clipStatuses[0].status = 'rendering';
    emit(0);
    const clipStart = performance.now();
    try {
      const blob = await recordClip(url, clips[0], {
        signal,
        onProgress: (p) => {
          clipStatuses[0].progress = p;
          emit(p);
        },
      });
      const clipMs = performance.now() - clipStart;
      clipStatuses[0].status = 'done';
      clipStatuses[0].progress = 1;
      onProgress?.({ overall: 1, clips: [{ index: 0, status: 'done', progress: 1 }] });
      const totalMs = performance.now() - startAll;
      const metrics: RenderMetrics = {
        totalMs,
        extractionMs: totalMs,
        encodingMs: 0,
        stitchMs: 0,
        clips: [{ clipId: '0', extractionMs: clipMs, encodingMs: 0, totalMs: clipMs, framesExtracted: 0 }],
        framesPerSecond: 0,
      };
      onComplete?.(metrics);
      return { blob, metrics };
    } finally {
      if (needsRevoke) URL.revokeObjectURL(url);
    }
  }

  // Multiple clips: one canvas + one MediaRecorder records all clips in a single
  // continuous stream. Blob-concatenating separate WebM recordings does not produce
  // a valid playable file because each recording has its own initialization segment
  // and timestamps, causing browsers to stop video playback after the first clip.
  const firstResolved = resolveUrl(clips[0]);
  const urlsToRevoke: string[] = [];
  if (firstResolved.needsRevoke) urlsToRevoke.push(firstResolved.url);

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.muted = true;
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
  document.body.appendChild(video);

  // Create AudioContext early (close to user gesture) so resume() succeeds.
  let audioCtx: AudioContext | null = null;
  try { audioCtx = new AudioContext(); } catch { /* not supported */ }

  // Declared here so finally can removeEventListener even if try throws before assignment.
  // eslint-disable-next-line prefer-const
  let onVisibilityChange: () => void = () => {};

  try {
    let currentUrl = firstResolved.url;

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('canplaythrough', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error(`Failed to load video: ${currentUrl}`)), { once: true });
      video.preload = 'auto';
      video.src = currentUrl;
      video.load();
    });

    const { canvasW, canvasH } = computeLayout(clips[0], video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    const canvasStream = canvas.captureStream(30);
    video.muted = false;

    if (audioCtx) {
      try {
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const audioSrc = audioCtx.createMediaElementSource(video);
        const audioDest = audioCtx.createMediaStreamDestination();
        const gain = audioCtx.createGain();
        gain.gain.value = clips[0].volume ?? 1;
        audioSrc.connect(gain);
        gain.connect(audioDest);
        audioDest.stream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
      } catch { /* CORS or unsupported — continue video-only */ }
    }

    const mimeType = pickMimeType();
    const recorderInit: MediaRecorderOptions = { mimeType };
    if (clips[0].quality === 'medium') recorderInit.videoBitsPerSecond = 2_500_000;
    const recorder = new MediaRecorder(canvasStream, recorderInit);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const supportsRVFC = 'requestVideoFrameCallback' in video;

    recorder.start(100);

    // Pause video + recorder when the tab is hidden so the browser doesn't stall
    // mid-render. Emits paused:true/false so the UI can show a resume hint.
    onVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
        try { if (recorder.state === 'recording') recorder.pause(); } catch { /* unsupported */ }
        emit(lastOverall, true);
      } else {
        try { if (recorder.state === 'paused') recorder.resume(); } catch { /* unsupported */ }
        video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
        emit(lastOverall, false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    for (let ci = 0; ci < clips.length; ci++) {
      if (signal?.aborted) break;

      const clip = clips[ci];
      const resolved = resolveUrl(clip);
      if (resolved.needsRevoke) urlsToRevoke.push(resolved.url);

      if (resolved.url !== currentUrl) {
        currentUrl = resolved.url;
        video.muted = true;
        await new Promise<void>((resolve, reject) => {
          video.addEventListener('canplaythrough', () => resolve(), { once: true });
          video.addEventListener('error', () => reject(new Error(`Failed to load video: ${currentUrl}`)), { once: true });
          video.src = currentUrl;
          video.load();
        });
        video.muted = false;
      }

      const startTime = clip.startTime ?? 0;
      const endTime = clip.endTime ?? video.duration;
      const duration = endTime - startTime;
      const layout = computeLayout(clip, video.videoWidth, video.videoHeight);
      const captionSegs = clip.captions?.segments ?? [];
      const baseStyle = mergeStyle(
        STYLE_PRESETS[clip.captions?.style?.preset ?? 'modern'],
        clip.captions?.style
      );

      clipStatuses[ci].status = 'rendering';
      emit(ci / clips.length);

      const clipStart = performance.now();
      await seekTo(video, startTime);
      if (signal?.aborted) break;

      await new Promise<void>((resolve, reject) => {
        let frameHandle = 0;
        let intervalId: ReturnType<typeof setInterval>;
        let settled = false;

        function scheduleFrame() {
          if (supportsRVFC) {
            frameHandle = (video as HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number }).requestVideoFrameCallback(drawFrame);
          } else {
            frameHandle = requestAnimationFrame(drawFrame);
          }
        }

        function cancelFrame() {
          if (supportsRVFC) {
            (video as HTMLVideoElement & { cancelVideoFrameCallback(id: number): void }).cancelVideoFrameCallback(frameHandle);
          } else {
            cancelAnimationFrame(frameHandle);
          }
        }

        function finish() {
          if (settled) return;
          settled = true;
          cancelFrame();
          clearInterval(intervalId);
          video.pause();
          resolve();
        }

        function abort() {
          if (settled) return;
          settled = true;
          cancelFrame();
          clearInterval(intervalId);
          video.pause();
          reject(new DOMException('Render cancelled', 'AbortError'));
        }

        function drawFrame() {
          ctx.drawImage(video, layout.srcX, layout.srcY, layout.srcW, layout.srcH, 0, 0, canvasW, canvasH);
          const clipTime = video.currentTime - startTime;
          for (const seg of getActiveCaptions(captionSegs, clipTime)) {
            renderCaption(ctx, seg, mergeStyle(baseStyle, seg.style), canvasW, canvasH);
          }
          if (video.currentTime < endTime) {
            scheduleFrame();
          } else {
            finish();
          }
        }

        intervalId = setInterval(() => {
          if (signal?.aborted) { abort(); return; }
          clipStatuses[ci].progress = Math.min((video.currentTime - startTime) / duration, 0.99);
          emit((ci + clipStatuses[ci].progress) / clips.length);
        }, 200);

        video.play().catch(() => {
          video.muted = true;
          video.play().catch(reject);
        });
        scheduleFrame();

        video.addEventListener('ended', finish, { once: true });
      });

      if (signal?.aborted) break;

      const clipMs = performance.now() - clipStart;
      clipStatuses[ci].status = 'done';
      clipStatuses[ci].progress = 1;
      clipMetrics.push({
        clipId: String(ci),
        extractionMs: clipMs,
        encodingMs: 0,
        totalMs: clipMs,
        framesExtracted: 0,
      });
      emit((ci + 1) / clips.length);
    }

    const finalBlob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () => reject(new Error('Recording failed'));
      if (recorder.state !== 'inactive') recorder.stop();
    });

    if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');

    onProgress?.({ overall: 1, clips: clipStatuses.map((s) => ({ ...s, progress: 1 })) });

    const totalMs = performance.now() - startAll;
    const metrics: RenderMetrics = {
      totalMs,
      extractionMs: totalMs,
      encodingMs: 0,
      stitchMs: 0,
      clips: clipMetrics,
      framesPerSecond: 0,
    };
    onComplete?.(metrics);
    return { blob: finalBlob, metrics };

  } finally {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    video.remove();
    if (audioCtx) audioCtx.close().catch(() => {});
    for (const url of urlsToRevoke) URL.revokeObjectURL(url);
  }
}

export function isCanvasRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  );
}
