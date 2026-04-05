import type { CaptionOptions } from '../types.js';

export interface WorkerClipMeta {
  width: number;
  height: number;
  fps: number;
  captions?: CaptionOptions;
  totalFrames: number;
}

export type WorkerInbound =
  | { type: 'init'; meta: WorkerClipMeta }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number; index: number }
  | { type: 'end' }
  | { type: 'abort' };

export interface TransferableFrame {
  buffer: ArrayBuffer; // raw RGBA pixel data (Uint8ClampedArray backing buffer)
  timestamp: number;   // seconds, relative to clip start
  width: number;
  height: number;
}

export type WorkerOutbound =
  | { type: 'progress'; value: number }
  | { type: 'done'; frames: TransferableFrame[] }
  | { type: 'error'; message: string };
