# FrameWorker

**Browser-native video clip export.** Trim, caption, and export video Blobs entirely in the browser — no server, no upload, no backend.

[![npm](https://img.shields.io/npm/v/framewebworker)](https://www.npmjs.com/package/framewebworker)
[![CI](https://github.com/nareshipme/framewebworker/actions/workflows/ci.yml/badge.svg)](https://github.com/nareshipme/framewebworker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Export segments** from a single source video with `exportClips()`
- **Merge clips** from multiple source videos with `mergeClips()`
- **Overlay captions** with built-in style presets (`hormozi`, `modern`, `minimal`, `bold`)
- **Canvas recording pipeline** — uses `MediaRecorder` + `captureStream`, no WASM, no extra dependencies
- **Timing metrics** — per-clip render times and overall throughput
- **Framework-agnostic core** + React hooks (`framewebworker/react`)
- **TypeScript-first** with full type exports
- Respects `AbortSignal` for cancellation

## Install

```bash
npm install framewebworker
```

No extra dependencies required. The canvas recording pipeline runs natively in every modern browser.

---

## Which API should I use?

| | `exportClips()` | `mergeClips()` |
|---|---|---|
| **Source videos** | One URL, multiple time ranges | Multiple clips, each with its own source |
| **Best for** | Highlight reels, chapter exports | Joining footage from different files |
| **React hook** | `useExportClips(videoUrl, segments)` | `useMergeClips(fw)` |

Both produce a single concatenated `Blob` and return `RenderMetrics`.

---

## `exportClips()` — One video, multiple segments

```ts
import { exportClips } from 'framewebworker';

const { blob, metrics } = await exportClips(
  'https://example.com/interview.mp4',
  [
    { start: 10, end: 25 },
    { start: 42, end: 58 },
  ],
  {
    onProgress: ({ overall }) => console.log(`${Math.round(overall * 100)}%`),
    onComplete: (m) => console.log(`Done in ${(m.totalMs / 1000).toFixed(1)}s`),
  }
);

const url = URL.createObjectURL(blob);
```

### With captions

Caption timestamps are relative to the clip's `start`:

```ts
const { blob } = await exportClips('https://example.com/video.mp4', [
  {
    start: 0,
    end: 8,
    captions: [
      { text: 'Welcome back',    startTime: 0, endTime: 3 },
      { text: 'Today we cover…', startTime: 3, endTime: 8 },
    ],
  },
]);
```

### `exportClipsToUrl()`

```ts
import { exportClipsToUrl } from 'framewebworker';

const { url } = await exportClipsToUrl('https://example.com/video.mp4', [
  { start: 5, end: 30 },
]);
videoElement.src = url;
```

---

## `mergeClips()` — Multiple source videos

```ts
import { createFrameWorker } from 'framewebworker';

const fw = createFrameWorker();

const { blob } = await fw.mergeClips([
  { source: fileA, startTime: 0,  endTime: 10 },
  { source: fileB, startTime: 5,  endTime: 20 },
], {
  onProgress: ({ overall }) => console.log(`${Math.round(overall * 100)}%`),
});
```

---

## React hooks

Import from `framewebworker/react`.

### `useExportClips`

```tsx
import { useExportClips } from 'framewebworker/react';

export function Exporter({ videoUrl }: { videoUrl: string }) {
  const { start, cancel, isRendering, progress, url, error } = useExportClips(
    videoUrl,
    [{ start: 10, end: 25 }, { start: 60, end: 80 }]
  );

  return (
    <div>
      <button onClick={start} disabled={isRendering}>
        {isRendering ? `${Math.round((progress?.overall ?? 0) * 100)}%` : 'Export'}
      </button>
      <button onClick={cancel} disabled={!isRendering}>Cancel</button>
      {error && <p>{error.message}</p>}
      {url && <a href={url} download="clips.webm">Download</a>}
    </div>
  );
}
```

### `useMergeClips`

```tsx
import { createFrameWorker } from 'framewebworker';
import { useMergeClips } from 'framewebworker/react';

const fw = createFrameWorker();

export function MergePanel() {
  const { mergeClips, isRendering, progress, url } = useMergeClips(fw);

  return (
    <div>
      <button onClick={() => mergeClips([
        { source: fileA, startTime: 0, endTime: 10 },
        { source: fileB, startTime: 5, endTime: 20 },
      ])} disabled={isRendering}>
        Merge
      </button>
      {progress && <progress value={progress.overall} />}
      {url && <a href={url} download="output.webm">Download</a>}
    </div>
  );
}
```

---

## API Reference

### `exportClips(videoUrl, segments, options?)`

| Param | Type | Description |
|-------|------|-------------|
| `videoUrl` | `string` | Source video URL |
| `segments` | `Segment[]` | Time ranges to export |
| `options` | `ExportOptions` | See below |

### `createFrameWorker(config?)`

| Method | Returns | Description |
|--------|---------|-------------|
| `mergeClips(clips[], opts?)` | `Promise<{ blob, metrics }>` | Merge multiple `ClipSource`s |
| `mergeClipsToUrl(clips[], opts?)` | `Promise<{ url, metrics }>` | Merge + object URL |
| `render(clip, opts?)` | `Promise<Blob>` | Render a single clip |
| `renderToUrl(clip, opts?)` | `Promise<string>` | Render + object URL |

### `Segment`

| Field | Type | Description |
|-------|------|-------------|
| `start` | `number` | Start time in seconds |
| `end` | `number` | End time in seconds |
| `captions` | `CaptionSegment[]` | Captions to overlay |

### `ClipSource`

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string \| File \| Blob \| HTMLVideoElement` | Video source |
| `startTime` | `number` | Trim start (seconds, default: 0) |
| `endTime` | `number` | Trim end (seconds, default: duration) |
| `captions` | `CaptionOptions` | Caption segments + style |
| `crop` | `CropOptions` | Crop region (0–1 fractions) |
| `aspectRatio` | `AspectRatio` | `'16:9' \| '9:16' \| '1:1' \| '4:3' \| '3:4' \| 'original'` |
| `volume` | `number` | Volume multiplier 0–2 (default: 1) |

### `ExportOptions` / `MergeOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `signal` | `AbortSignal` | — | Cancellation |
| `onProgress` | `(p: RichProgress) => void` | — | Progress callback |
| `onComplete` | `(m: RenderMetrics) => void` | — | Called when done |

### `RenderMetrics`

```ts
interface RenderMetrics {
  totalMs: number;         // wall-clock time for the entire operation
  extractionMs: number;    // total clip render time
  encodingMs: number;      // always 0 (no separate encode step)
  stitchMs: number;        // always 0 (blobs concatenated in memory)
  framesPerSecond: number;
  clips: ClipMetrics[];
}
```

---

## Caption Style Presets

| Preset | Description |
|--------|-------------|
| `hormozi` | Chunky Impact font, gold word highlight, black stroke |
| `modern` | Clean Inter font, semi-transparent pill background |
| `minimal` | Thin sans-serif, text shadow only |
| `bold` | Yellow-on-black, heavy stroke, uppercase |

Override any property via `captions.style`:

```ts
captions: {
  segments: [...],
  style: { preset: 'hormozi', fontSize: 80, color: '#00FF00' },
}
```

---

## Browser Support

Requires `MediaRecorder` + `HTMLCanvasElement.captureStream` — available in all modern browsers.

| Browser | Support |
|---------|---------|
| Chrome / Edge | ✓ 74+ |
| Firefox | ✓ 71+ |
| Safari | ✓ 15.4+ |

No special COOP/COEP headers required.

---

## Migration from v0.4

The canvas recording pipeline replaces WebCodecs and ffmpeg.wasm:

- **Remove** `@ffmpeg/ffmpeg`, `@ffmpeg/util`, and `mp4-muxer` from your dependencies
- **Remove** any `backend` option passed to `exportClips()` or `createFrameWorker()` — no longer supported
- **Replace** `isWebCodecsSupported()` with `isCanvasRecordingSupported()`
- Output format is now **WebM** — update any hardcoded `.mp4` filenames or `accept` filters
- `RenderMetrics.encodingMs` and `stitchMs` are always `0`

---

## Migration from v0.1

All v0.1 names are kept as deprecated aliases:

| v0.1 | Current |
|------|---------|
| `render()` | `exportClips()` |
| `renderToUrl()` | `exportClipsToUrl()` |
| `fw.stitch()` | `fw.mergeClips()` |
| `fw.stitchToUrl()` | `fw.mergeClipsToUrl()` |
| `useRender()` | `useExportClips()` |
| `useStitch()` | `useMergeClips()` |
| `StitchOptions` | `MergeOptions` |
| `ClipInput` | `ClipSource` |

---

## License

MIT © nareshipme
