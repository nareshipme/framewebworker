import type { WorkerInbound, WorkerOutbound, WorkerClipMeta, TransferableFrame } from './protocol.js';
import { getActiveCaptions, renderCaption, STYLE_PRESETS, mergeStyle } from '../captions.js';

// Cast self to the worker global type to get the correct postMessage signature
const workerSelf = self as unknown as DedicatedWorkerGlobalScope;

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let meta: WorkerClipMeta | null = null;
let frames: TransferableFrame[] = [];
let currentJobId: string | null = null;

workerSelf.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init': {
        currentJobId = msg.jobId;
        ctx = msg.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        meta = msg.meta;
        frames = [];
        break;
      }

      case 'frame': {
        if (!ctx || !meta || msg.jobId !== currentJobId) {
          msg.bitmap.close();
          break;
        }

        const { width, height, captions, captionStyle } = meta;

        ctx.drawImage(msg.bitmap, 0, 0, width, height);
        msg.bitmap.close(); // release GPU memory

        if (captions.length > 0) {
          const active = getActiveCaptions(captions, msg.timestamp);
          for (const seg of active) {
            const segStyle = mergeStyle(captionStyle, seg.style);
            // OffscreenCanvasRenderingContext2D shares the same canvas 2D API
            renderCaption(ctx as unknown as CanvasRenderingContext2D, seg, segStyle, width, height);
          }
        }

        const imageData = ctx.getImageData(0, 0, width, height);
        frames.push({
          buffer: imageData.data.buffer,
          timestamp: msg.timestamp,
          width,
          height,
        });

        const progress: WorkerOutbound = {
          type: 'progress',
          jobId: msg.jobId,
          currentFrame: msg.frameIndex + 1,
          totalFrames: meta.totalFrames,
        };
        workerSelf.postMessage(progress);
        break;
      }

      case 'end': {
        if (msg.jobId !== currentJobId) break;

        const transferBuffers = frames.map((f) => f.buffer);
        const done: WorkerOutbound = {
          type: 'done',
          jobId: msg.jobId,
          frames: [...frames],
        };
        workerSelf.postMessage(done, transferBuffers);

        ctx = null;
        meta = null;
        frames = [];
        currentJobId = null;
        break;
      }

      case 'abort': {
        if (msg.jobId !== currentJobId) break;
        ctx = null;
        meta = null;
        frames = [];
        currentJobId = null;
        break;
      }
    }
  } catch (err) {
    const error: WorkerOutbound = {
      type: 'error',
      jobId: msg.jobId,
      message: err instanceof Error ? err.message : String(err),
    };
    workerSelf.postMessage(error);
  }
};
