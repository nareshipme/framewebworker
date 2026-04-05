import type { ClipInput, FrameData } from '../types.js';
import type { WorkerInbound, WorkerOutbound, TransferableFrame } from './protocol.js';
import { STYLE_PRESETS, mergeStyle } from '../captions.js';

export interface InternalRenderOptions {
  fps: number;
  width: number;
  height: number;
  signal?: AbortSignal;
}

interface QueuedJob {
  jobId: string;
  clip: ClipInput;
  options: InternalRenderOptions;
  onProgress: (current: number, total: number) => void;
  resolve: (frames: FrameData[]) => void;
  reject: (err: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private queue: QueuedJob[] = [];

  constructor(maxConcurrency: number) {
    const count = Math.min(maxConcurrency, navigator.hardwareConcurrency || 2, 4);
    for (let i = 0; i < count; i++) {
      const worker = new Worker(
        new URL('./render-worker.js', import.meta.url),
        { type: 'module' }
      );
      this.workers.push(worker);
      this.idleWorkers.push(worker);
    }
  }

  dispatch(
    jobId: string,
    clip: ClipInput,
    options: InternalRenderOptions,
    onProgress: (current: number, total: number) => void
  ): Promise<FrameData[]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ jobId, clip, options, onProgress, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop()!;
      const job = this.queue.shift()!;
      this.runJob(worker, job);
    }
  }

  private async runJob(worker: Worker, job: QueuedJob): Promise<void> {
    try {
      const frames = await this.executeJob(worker, job);
      job.resolve(frames);
    } catch (err) {
      job.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.idleWorkers.push(worker);
      this.processQueue();
    }
  }

  private async executeJob(worker: Worker, job: QueuedJob): Promise<FrameData[]> {
    const { jobId, clip, options, onProgress } = job;
    const { fps, width: outW, height: outH, signal } = options;

    // Load video on main thread
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

    try {
      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => res();
        video.onerror = () => rej(new Error(`Failed to load video: ${srcUrl}`));
        video.src = srcUrl;
      });
    } catch (err) {
      if (needsRevoke) URL.revokeObjectURL(srcUrl);
      throw err;
    }

    const duration = video.duration;
    const startSec = clip.startTime ?? 0;
    const endSec = clip.endTime ?? duration;
    const clipDuration = endSec - startSec;
    const totalFrames = Math.ceil(clipDuration * fps);

    const captionSegments = clip.captions?.segments ?? [];
    const baseStylePreset = clip.captions?.style?.preset ?? 'modern';
    const captionStyle = mergeStyle(STYLE_PRESETS[baseStylePreset], clip.captions?.style);

    // Transfer OffscreenCanvas to worker
    const offscreen = new OffscreenCanvas(outW, outH);
    const initMsg: WorkerInbound = {
      type: 'init',
      jobId,
      canvas: offscreen,
      meta: { captions: captionSegments, captionStyle, width: outW, height: outH, totalFrames },
    };
    worker.postMessage(initMsg, [offscreen]);

    // Collect reassembled frames from worker 'done' message
    const resultFrames: FrameData[] = [];

    await new Promise<void>((res, rej) => {
      let aborted = false;

      const onMessage = (event: MessageEvent<WorkerOutbound>) => {
        const msg = event.data;
        if (msg.jobId !== jobId) return;

        if (msg.type === 'progress') {
          onProgress(msg.currentFrame, msg.totalFrames);
        } else if (msg.type === 'done') {
          worker.removeEventListener('message', onMessage);
          for (const tf of msg.frames) {
            resultFrames.push({
              imageData: new ImageData(new Uint8ClampedArray(tf.buffer), tf.width, tf.height),
              timestamp: tf.timestamp,
              width: tf.width,
              height: tf.height,
            });
          }
          res();
        } else if (msg.type === 'error') {
          worker.removeEventListener('message', onMessage);
          rej(new Error(msg.message));
        }
      };

      worker.addEventListener('message', onMessage);

      if (signal) {
        signal.addEventListener('abort', () => {
          if (aborted) return;
          aborted = true;
          const abortMsg: WorkerInbound = { type: 'abort', jobId };
          worker.postMessage(abortMsg);
          worker.removeEventListener('message', onMessage);
          rej(new DOMException('Render cancelled', 'AbortError'));
        }, { once: true });
      }

      // Seek and stream frames from main thread to worker
      (async () => {
        try {
          for (let i = 0; i < totalFrames; i++) {
            if (signal?.aborted || aborted) break;

            const t = startSec + i / fps;
            await seekVideo(video, t);

            // Handle crop/aspect-ratio on the main thread via createImageBitmap
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            let sx = 0, sy = 0, sw = vw, sh = vh;

            if (clip.crop) {
              sx = clip.crop.x * vw;
              sy = clip.crop.y * vw;
              sw = clip.crop.width * vw;
              sh = clip.crop.height * vh;
            } else {
              const videoAR = vw / vh;
              const outAR = outW / outH;
              if (videoAR > outAR) {
                sw = vh * outAR;
                sx = (vw - sw) / 2;
              } else if (videoAR < outAR) {
                sh = vw / outAR;
                sy = (vh - sh) / 2;
              }
            }

            const bitmap = await createImageBitmap(video, sx, sy, sw, sh, {
              resizeWidth: outW,
              resizeHeight: outH,
            });

            const frameMsg: WorkerInbound = {
              type: 'frame',
              jobId,
              frameIndex: i,
              bitmap,
              timestamp: t - startSec,
            };
            worker.postMessage(frameMsg, [bitmap]);
          }

          if (!signal?.aborted && !aborted) {
            const endMsg: WorkerInbound = { type: 'end', jobId };
            worker.postMessage(endMsg);
          }
        } catch (err) {
          if (!aborted) rej(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });

    if (needsRevoke) URL.revokeObjectURL(srcUrl);
    return resultFrames;
  }

  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.idleWorkers = [];
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
