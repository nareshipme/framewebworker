import type { CaptionSegment, CaptionStyle } from '../types.js';

export interface WorkerClipMeta {
  captions: CaptionSegment[];
  captionStyle: CaptionStyle;
  width: number;
  height: number;
  totalFrames: number;
}

export type WorkerInbound =
  | { type: 'init'; jobId: string; canvas: OffscreenCanvas; meta: WorkerClipMeta }
  | { type: 'frame'; jobId: string; frameIndex: number; bitmap: ImageBitmap; timestamp: number }
  | { type: 'end'; jobId: string }
  | { type: 'abort'; jobId: string };

export interface TransferableFrame {
  buffer: ArrayBuffer; // raw RGBA pixels
  timestamp: number;
  width: number;
  height: number;
}

export type WorkerOutbound =
  | { type: 'progress'; jobId: string; currentFrame: number; totalFrames: number }
  | { type: 'done'; jobId: string; frames: TransferableFrame[] }
  | { type: 'error'; jobId: string; message: string };
