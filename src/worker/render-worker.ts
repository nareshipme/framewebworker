import type { WorkerInbound, WorkerOutbound, TransferableFrame, WorkerClipMeta } from './protocol.js';
import { STYLE_PRESETS, mergeStyle, getActiveCaptions, renderCaption } from '../captions.js';

let meta: WorkerClipMeta | null = null;
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
const collected: TransferableFrame[] = [];

self.onmessage = (event: MessageEvent<WorkerInbound>): void => {
  const msg = event.data;

  switch (msg.type) {
    case 'init': {
      meta = msg.meta;
      canvas = new OffscreenCanvas(meta.width, meta.height);
      ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      collected.length = 0;
      break;
    }

    case 'frame': {
      if (!meta || !ctx) return;
      const { bitmap, timestamp, index } = msg;

      ctx.clearRect(0, 0, meta.width, meta.height);
      ctx.drawImage(bitmap, 0, 0, meta.width, meta.height);
      bitmap.close();

      if (meta.captions?.segments?.length) {
        const baseStylePreset = meta.captions.style?.preset ?? 'modern';
        const baseStyle = mergeStyle(STYLE_PRESETS[baseStylePreset], meta.captions.style);
        const active = getActiveCaptions(meta.captions.segments, timestamp);
        for (const seg of active) {
          const segStyle = mergeStyle(baseStyle, seg.style);
          renderCaption(
            ctx as unknown as CanvasRenderingContext2D,
            seg,
            segStyle,
            meta.width,
            meta.height
          );
        }
      }

      const imageData = ctx.getImageData(0, 0, meta.width, meta.height);
      // Slice to own the buffer before transferring
      const buffer = imageData.data.buffer.slice(
        imageData.data.byteOffset,
        imageData.data.byteOffset + imageData.data.byteLength
      );
      collected.push({ buffer, timestamp, width: meta.width, height: meta.height });

      const progress: WorkerOutbound = { type: 'progress', value: (index + 1) / meta.totalFrames };
      self.postMessage(progress);
      break;
    }

    case 'end': {
      const frames = collected.slice();
      const transferables = frames.map(f => f.buffer);
      const done: WorkerOutbound = { type: 'done', frames };
      (self as unknown as Worker).postMessage(done, transferables);
      collected.length = 0;
      break;
    }

    case 'abort': {
      collected.length = 0;
      break;
    }
  }
};
