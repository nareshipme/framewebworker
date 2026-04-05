import type { RendererBackend, FrameData, EncodeOptions } from '../types.js';

export class FFmpegBackend implements RendererBackend {
  readonly name = 'ffmpeg.wasm';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ffmpeg: any = null;
  private initialized = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _fetchFile: any = null;

  async init(): Promise<void> {
    if (this.initialized) return;

    const { FFmpeg } = await import('@ffmpeg/ffmpeg').catch(() => {
      throw new Error(
        '[FrameWorker] @ffmpeg/ffmpeg is required. Install it: npm install @ffmpeg/ffmpeg @ffmpeg/util'
      );
    });
    const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

    const ffmpeg = new FFmpeg();

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    this._fetchFile = fetchFile;
    this.ffmpeg = ffmpeg;
    this.initialized = true;
  }

  async encode(frames: FrameData[], options: EncodeOptions): Promise<Blob> {
    await this.init();
    const { ffmpeg, _fetchFile: fetchFile } = this;
    const { fps, width, height, onProgress, signal } = options;

    const total = frames.length;
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');

      const frame = frames[i];
      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext('2d')!;
      ctx.putImageData(frame.imageData, 0, 0);
      const blob = await offscreen.convertToBlob({ type: 'image/png' });
      const data = await fetchFile(blob);
      await ffmpeg.writeFile(`frame${String(i).padStart(6, '0')}.png`, data);

      onProgress?.(i / total * 0.8);
    }

    await ffmpeg.exec([
      '-framerate', String(fps),
      '-i', 'frame%06d.png',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '23',
      '-movflags', '+faststart',
      'output.mp4',
    ]);

    onProgress?.(0.95);

    const data = await ffmpeg.readFile('output.mp4') as Uint8Array;

    for (let i = 0; i < total; i++) {
      await ffmpeg.deleteFile(`frame${String(i).padStart(6, '0')}.png`).catch(() => {});
    }
    await ffmpeg.deleteFile('output.mp4').catch(() => {});

    onProgress?.(1);

    return new Blob([data.slice().buffer], { type: 'video/mp4' });
  }

  async concat(blobs: Blob[], options: EncodeOptions): Promise<Blob> {
    await this.init();
    const { ffmpeg, _fetchFile: fetchFile } = this;
    const { onProgress } = options;

    const listLines: string[] = [];
    for (let i = 0; i < blobs.length; i++) {
      const name = `clip${i}.mp4`;
      const data = await fetchFile(blobs[i]);
      await ffmpeg.writeFile(name, data);
      listLines.push(`file '${name}'`);
      onProgress?.(i / blobs.length * 0.6);
    }

    const encoder = new TextEncoder();
    await ffmpeg.writeFile('concat.txt', encoder.encode(listLines.join('\n')));

    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      'stitched.mp4',
    ]);

    onProgress?.(0.9);

    const out = await ffmpeg.readFile('stitched.mp4') as Uint8Array;

    for (let i = 0; i < blobs.length; i++) {
      await ffmpeg.deleteFile(`clip${i}.mp4`).catch(() => {});
    }
    await ffmpeg.deleteFile('concat.txt').catch(() => {});
    await ffmpeg.deleteFile('stitched.mp4').catch(() => {});

    onProgress?.(1);

    return new Blob([out.slice().buffer], { type: 'video/mp4' });
  }

  async destroy(): Promise<void> {
    if (this.ffmpeg) {
      await this.ffmpeg.terminate?.();
      this.ffmpeg = null;
      this.initialized = false;
    }
  }
}

export function createFFmpegBackend(): FFmpegBackend {
  return new FFmpegBackend();
}
