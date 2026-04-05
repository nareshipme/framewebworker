# FrameWorker

**Browser-native video rendering and clip export.** Trim, caption, and export MP4 Blobs entirely in the browser — no server, no upload, no backend.

[![npm](https://img.shields.io/npm/v/framewebworker)](https://www.npmjs.com/package/framewebworker)
[![CI](https://github.com/nareshipme/frameworker/actions/workflows/ci.yml/badge.svg)](https://github.com/nareshipme/frameworker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Trim** any video to a time range
- **Overlay captions** with built-in style presets (`hormozi`, `modern`, `minimal`, `bold`)
- **Stitch** multiple source videos into one export
- **Render** multiple segments from a single source video (more efficient for highlight reels, clip editors)
- **Parallel rendering** via OffscreenCanvas + Web Workers — automatic on supported browsers
- **Timing metrics** — per-clip extraction/encoding times, overall FPS throughput
- **Pluggable renderer backend** (default: ffmpeg.wasm)
- **Framework-agnostic core** + React hooks (`framewebworker/react`)
- **TypeScript-first** with full type exports
- Respects `AbortSignal` for cancellation

## Install

```bash
npm install framewebworker @ffmpeg/ffmpeg @ffmpeg/util
```

> `@ffmpeg/ffmpeg` and `@ffmpeg/util` are optional peer dependencies required only by the default ffmpeg.wasm backend. If you supply your own backend you don't need them.

---

## Which API should I use?

| | `render()` | `stitch()` |
|---|---|---|
| **Source videos** | One URL, multiple time ranges | Multiple clips, each with its own source |
| **Best for** | Highlight reels, multi-segment exports from one file | Joining clips from different files |
| **Video loading** | Loads the source once, seeks per segment | Loads each source independently |
| **Progress** | `RichProgress` with per-segment status | `RichProgress` with per-clip status |
| **Metrics** | `RenderMetrics` on completion | `RenderMetrics` on completion |

Both APIs produce an identical output: a single concatenated MP4 `Blob`.

---

## `render()` — One video, multiple segments

Use this when you're exporting multiple time ranges from the **same source file** — a clip editor, a highlight reel generator, a chapter trimmer.

```ts
import { render } from 'framewebworker';

const { blob, metrics } = await render(
  'https://example.com/interview.mp4',
  [
    { start: 10, end: 25 },
    { start: 42, end: 58 },
    { start: 90, end: 110 },
  ],
  {
    width: 1280,
    height: 720,
    fps: 30,
    onProgress: ({ overall, clips }) => {
      console.log(`Overall: ${Math.round(overall * 100)}%`);
      clips.forEach(c => console.log(`  segment ${c.index}: ${c.status}`));
    },
    onComplete: (metrics) => {
      console.log(`Done in ${metrics.totalMs.toFixed(0)}ms — ${metrics.framesPerSecond.toFixed(1)} fps`);
    },
  }
);

const url = URL.createObjectURL(blob);
```

### With captions per segment

```ts
import { render } from 'framewebworker';
import type { Segment } from 'framewebworker';

const segments: Segment[] = [
  {
    start: 0,
    end: 8,
    captions: [
      { text: 'Welcome back', startTime: 0, endTime: 3 },
      { text: 'Today we cover...', startTime: 3, endTime: 8 },
    ],
  },
  {
    start: 45,
    end: 60,
    captions: [
      { text: 'The key insight', startTime: 45, endTime: 52 },
    ],
  },
];

const { blob } = await render('https://example.com/video.mp4', segments, {
  width: 1080,
  height: 1920, // 9:16 portrait
  fps: 30,
});
```

Caption timestamps in `Segment.captions` are **absolute** (relative to the source video), matching the segment's `start`/`end` range.

### `renderToUrl()`

Convenience wrapper that returns an object URL directly:

```ts
import { renderToUrl } from 'framewebworker';

const { url, metrics } = await renderToUrl(
  'https://example.com/video.mp4',
  [{ start: 5, end: 30 }]
);

videoElement.src = url;
```

---

## `stitch()` — Multiple source videos

Use this when you're joining clips from **different source files**.

```ts
const fw = createFrameWorker();

const { blob, metrics } = await fw.stitch([
  { source: fileA, startTime: 0,  endTime: 10 },
  { source: fileB, startTime: 5,  endTime: 20 },
  { source: fileC, startTime: 12, endTime: 25 },
], {
  width: 1920,
  height: 1080,
  onProgress: ({ overall }) => console.log(`${Math.round(overall * 100)}%`),
});
```

---

## React hooks

Import from `framewebworker/react`.

### `useRender` — single video, multiple segments

```tsx
import { useRender } from 'framewebworker/react';

export function HighlightExporter({ videoUrl }: { videoUrl: string }) {
  const segments = [
    { start: 10, end: 25 },
    { start: 60, end: 80 },
  ];

  const { start, cancel, isRendering, progress, metrics, url, error } = useRender(
    videoUrl,
    segments,
    { width: 1280, height: 720, fps: 30 }
  );

  return (
    <div>
      <button onClick={start} disabled={isRendering}>
        {isRendering ? `Rendering… ${Math.round((progress?.overall ?? 0) * 100)}%` : 'Export'}
      </button>
      <button onClick={cancel} disabled={!isRendering}>Cancel</button>

      {metrics && (
        <p>
          Done in {(metrics.totalMs / 1000).toFixed(1)}s —{' '}
          {metrics.framesPerSecond.toFixed(1)} fps
        </p>
      )}
      {error && <p style={{ color: 'red' }}>{error.message}</p>}
      {url && <a href={url} download="highlight.mp4">Download</a>}
    </div>
  );
}
```

`useRender` signature:

```ts
function useRender(
  videoUrl: string | null,
  segments: Segment[],
  options?: Omit<SingleVideoRenderOptions, 'onProgress' | 'onComplete' | 'signal'>
): {
  start: () => void;
  cancel: () => void;
  isRendering: boolean;
  progress: RichProgress | null;
  metrics: RenderMetrics | null;
  url: string | null;
  error: Error | null;
}
```

Passing `null` as `videoUrl` disables the hook; calling `start()` is a no-op until it's set.

### `useStitch` — multiple source clips

```tsx
import { useStitch } from 'framewebworker/react';

const fw = createFrameWorker();

export function StitchPanel() {
  const { stitch, isRendering, progress, metrics, url } = useStitch(fw);

  const handleExport = () =>
    stitch([
      { source: fileA, startTime: 0, endTime: 10 },
      { source: fileB, startTime: 5, endTime: 20 },
    ]);

  return (
    <div>
      <button onClick={handleExport} disabled={isRendering}>Export</button>
      {progress && <progress value={progress.overall} />}
      {metrics && <p>{metrics.framesPerSecond.toFixed(1)} fps</p>}
      {url && <a href={url} download="output.mp4">Download</a>}
    </div>
  );
}
```

### `useClipRender` — single clip via FrameWorker instance

For rendering a single `ClipInput` through a `FrameWorker` instance (the v0.1.x API):

```tsx
import { useClipRender } from 'framewebworker/react';

const fw = createFrameWorker();

export function ClipExporter({ file }: { file: File }) {
  const { render, isRendering, progress, url } = useClipRender(fw);

  return (
    <button onClick={() => render({ source: file, startTime: 0, endTime: 30 })} disabled={isRendering}>
      {isRendering ? `${Math.round(progress * 100)}%` : 'Export clip'}
    </button>
  );
}
```

> Previously exported as `useRender`. If you were using `useRender(fw)` from an earlier version, rename it to `useClipRender(fw)`.

---

## `RenderMetrics` — timing output

Both `render()` and `stitch()` resolve with `{ blob, metrics }`. `onComplete` also receives the same object.

```ts
interface RenderMetrics {
  totalMs: number;        // wall-clock time for the entire operation
  extractionMs: number;   // sum of all segment/clip frame-extraction times
  encodingMs: number;     // sum of all segment/clip ffmpeg encoding times
  stitchMs: number;       // time for the final ffmpeg concat pass
  framesPerSecond: number; // total frames / (totalMs / 1000)
  clips: ClipMetrics[];   // one entry per segment or clip
}

interface ClipMetrics {
  clipId: string;         // segment index (as string)
  extractionMs: number;
  encodingMs: number;
  totalMs: number;        // extractionMs + encodingMs
  framesExtracted: number;
}
```

Example output for a three-segment render:

```ts
{
  totalMs: 4820,
  extractionMs: 3100,
  encodingMs: 1600,
  stitchMs: 120,
  framesPerSecond: 94.2,
  clips: [
    { clipId: '0', extractionMs: 980, encodingMs: 510, totalMs: 1490, framesExtracted: 450 },
    { clipId: '1', extractionMs: 1050, encodingMs: 560, totalMs: 1610, framesExtracted: 480 },
    { clipId: '2', extractionMs: 1070, encodingMs: 530, totalMs: 1600, framesExtracted: 510 },
  ]
}
```

---

## `SingleVideoRenderOptions`

Options accepted by `render()` / `renderToUrl()` / `useRender()`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `width` | `number` | `1280` | Output width in pixels |
| `height` | `number` | `720` | Output height in pixels |
| `fps` | `number` | `30` | Frames per second |
| `mimeType` | `string` | `'video/mp4'` | Output MIME type |
| `quality` | `number` | `0.92` | Quality 0–1 (non-ffmpeg backends) |
| `encoderOptions` | `Record<string, unknown>` | — | Extra options passed to the backend |
| `signal` | `AbortSignal` | — | Cancellation signal |
| `onProgress` | `(p: RichProgress) => void` | — | Called on every frame batch with per-segment status |
| `onComplete` | `(m: RenderMetrics) => void` | — | Called once when the final blob is ready |

`RichProgress` shape:

```ts
interface RichProgress {
  overall: number;       // 0–1 weighted average across all segments
  clips: ClipProgress[]; // one entry per segment
}

interface ClipProgress {
  index: number;
  status: 'pending' | 'rendering' | 'encoding' | 'done' | 'error';
  progress: number; // 0–1
}
```

---

## Caption Style Presets

| Preset | Description |
|--------|-------------|
| `hormozi` | Chunky Impact font, gold word highlight, black stroke — viral short-form style |
| `modern` | Clean Inter font, semi-transparent pill background |
| `minimal` | Thin sans-serif, text shadow only, no background |
| `bold` | Yellow-on-black, heavy stroke, uppercase — high contrast |

Override any property:

```ts
captions: {
  segments: [...],
  style: {
    preset: 'hormozi',
    fontSize: 80,
    color: '#00FF00',
  },
}
```

---

## `createFrameWorker` API reference

```ts
import { createFrameWorker } from 'framewebworker';

const fw = createFrameWorker({
  backend: myBackend, // optional, defaults to ffmpeg.wasm
  fps: 30,
  width: 1280,
  height: 720,
});
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `render` | `(clip, opts?) => Promise<Blob>` | Render a single `ClipInput` |
| `renderToUrl` | `(clip, opts?) => Promise<string>` | Render + create object URL |
| `stitch` | `(clips[], opts?) => Promise<{ blob, metrics }>` | Render + concat multiple clips |
| `stitchToUrl` | `(clips[], opts?) => Promise<{ url, metrics }>` | Stitch + create object URL |

### `ClipInput`

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string \| File \| Blob \| HTMLVideoElement` | Video source |
| `startTime` | `number` | Trim start (seconds, default: 0) |
| `endTime` | `number` | Trim end (seconds, default: duration) |
| `captions` | `CaptionOptions` | Caption segments + style |
| `crop` | `CropOptions` | Crop region (0–1 fractions) |
| `aspectRatio` | `AspectRatio` | `'16:9' \| '9:16' \| '1:1' \| '4:3' \| '3:4' \| 'original'` |
| `volume` | `number` | Volume multiplier 0–2 |

---

## BYOB: Bring Your Own Backend

Implement the `RendererBackend` interface to use any encoder:

```ts
import type { RendererBackend, FrameData, EncodeOptions } from 'framewebworker';

const myBackend: RendererBackend = {
  name: 'my-encoder',
  async init() {
    // load WASM, warm up workers, etc.
  },
  async encode(frames: FrameData[], opts: EncodeOptions): Promise<Blob> {
    // frames is FrameData[] — each has .imageData (ImageData), .timestamp, .width, .height
    // return a video Blob
  },
  async concat(blobs: Blob[], opts: EncodeOptions): Promise<Blob> {
    // concatenate multiple video Blobs into one
  },
};

const fw = createFrameWorker({ backend: myBackend });
```

---

## Browser Requirements

- Chrome/Edge 94+ or Firefox 90+ (OffscreenCanvas, Web Workers, WASM)
- COOP/COEP headers required for ffmpeg.wasm SharedArrayBuffer:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```

Browsers without `OffscreenCanvas` or `Worker` support fall back to sequential single-threaded rendering automatically.

---

## License

MIT © nareshipme
