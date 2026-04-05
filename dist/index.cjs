'use strict';

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/backends/ffmpeg.ts
var ffmpeg_exports = {};
__export(ffmpeg_exports, {
  FFmpegBackend: () => exports.FFmpegBackend,
  createFFmpegBackend: () => createFFmpegBackend
});
function createFFmpegBackend() {
  return new exports.FFmpegBackend();
}
exports.FFmpegBackend = void 0;
var init_ffmpeg = __esm({
  "src/backends/ffmpeg.ts"() {
    exports.FFmpegBackend = class {
      constructor() {
        this.name = "ffmpeg.wasm";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.ffmpeg = null;
        this.initialized = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this._fetchFile = null;
      }
      async init() {
        if (this.initialized) return;
        const { FFmpeg } = await import('@ffmpeg/ffmpeg').catch(() => {
          throw new Error(
            "[FrameWorker] @ffmpeg/ffmpeg is required. Install it: npm install @ffmpeg/ffmpeg @ffmpeg/util"
          );
        });
        const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
        const ffmpeg = new FFmpeg();
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm")
        });
        this._fetchFile = fetchFile;
        this.ffmpeg = ffmpeg;
        this.initialized = true;
      }
      async encode(frames, options) {
        await this.init();
        const { ffmpeg, _fetchFile: fetchFile } = this;
        const { fps, width, height, onProgress, signal } = options;
        const total = frames.length;
        for (let i = 0; i < total; i++) {
          if (signal?.aborted) throw new DOMException("Render cancelled", "AbortError");
          const frame = frames[i];
          const offscreen = new OffscreenCanvas(width, height);
          const ctx = offscreen.getContext("2d");
          ctx.putImageData(frame.imageData, 0, 0);
          const blob = await offscreen.convertToBlob({ type: "image/png" });
          const data2 = await fetchFile(blob);
          await ffmpeg.writeFile(`frame${String(i).padStart(6, "0")}.png`, data2);
          onProgress?.(i / total * 0.8);
        }
        await ffmpeg.exec([
          "-framerate",
          String(fps),
          "-i",
          "frame%06d.png",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-preset",
          "fast",
          "-crf",
          "23",
          "-movflags",
          "+faststart",
          "output.mp4"
        ]);
        onProgress?.(0.95);
        const data = await ffmpeg.readFile("output.mp4");
        for (let i = 0; i < total; i++) {
          await ffmpeg.deleteFile(`frame${String(i).padStart(6, "0")}.png`).catch(() => {
          });
        }
        await ffmpeg.deleteFile("output.mp4").catch(() => {
        });
        onProgress?.(1);
        return new Blob([data.slice().buffer], { type: "video/mp4" });
      }
      async concat(blobs, options) {
        await this.init();
        const { ffmpeg, _fetchFile: fetchFile } = this;
        const { onProgress } = options;
        const listLines = [];
        for (let i = 0; i < blobs.length; i++) {
          const name = `clip${i}.mp4`;
          const data = await fetchFile(blobs[i]);
          await ffmpeg.writeFile(name, data);
          listLines.push(`file '${name}'`);
          onProgress?.(i / blobs.length * 0.6);
        }
        const encoder = new TextEncoder();
        await ffmpeg.writeFile("concat.txt", encoder.encode(listLines.join("\n")));
        await ffmpeg.exec([
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          "concat.txt",
          "-c",
          "copy",
          "stitched.mp4"
        ]);
        onProgress?.(0.9);
        const out = await ffmpeg.readFile("stitched.mp4");
        for (let i = 0; i < blobs.length; i++) {
          await ffmpeg.deleteFile(`clip${i}.mp4`).catch(() => {
          });
        }
        await ffmpeg.deleteFile("concat.txt").catch(() => {
        });
        await ffmpeg.deleteFile("stitched.mp4").catch(() => {
        });
        onProgress?.(1);
        return new Blob([out.slice().buffer], { type: "video/mp4" });
      }
      async destroy() {
        if (this.ffmpeg) {
          await this.ffmpeg.terminate?.();
          this.ffmpeg = null;
          this.initialized = false;
        }
      }
    };
  }
});

// src/captions.ts
var STYLE_PRESETS = {
  hormozi: {
    preset: "hormozi",
    fontFamily: 'Impact, "Arial Black", sans-serif',
    fontSize: 64,
    fontWeight: "900",
    color: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 4,
    backgroundColor: "transparent",
    backgroundPadding: 0,
    backgroundRadius: 0,
    position: "bottom",
    textAlign: "center",
    lineHeight: 1.1,
    maxWidth: 0.9,
    shadow: true,
    shadowColor: "rgba(0,0,0,0.9)",
    shadowBlur: 6,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    uppercase: true,
    wordHighlight: true,
    wordHighlightColor: "#FFD700",
    wordHighlightTextColor: "#000000"
  },
  modern: {
    preset: "modern",
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    fontSize: 42,
    fontWeight: "700",
    color: "#FFFFFF",
    strokeColor: "transparent",
    strokeWidth: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    backgroundPadding: 12,
    backgroundRadius: 8,
    position: "bottom",
    textAlign: "center",
    lineHeight: 1.3,
    maxWidth: 0.85,
    shadow: false,
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    uppercase: false,
    wordHighlight: false,
    wordHighlightColor: "#3B82F6",
    wordHighlightTextColor: "#FFFFFF"
  },
  minimal: {
    preset: "minimal",
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    fontSize: 36,
    fontWeight: "400",
    color: "#FFFFFF",
    strokeColor: "transparent",
    strokeWidth: 0,
    backgroundColor: "transparent",
    backgroundPadding: 0,
    backgroundRadius: 0,
    position: "bottom",
    textAlign: "center",
    lineHeight: 1.4,
    maxWidth: 0.8,
    shadow: true,
    shadowColor: "rgba(0,0,0,0.8)",
    shadowBlur: 8,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    uppercase: false,
    wordHighlight: false,
    wordHighlightColor: "#FFFFFF",
    wordHighlightTextColor: "#000000"
  },
  bold: {
    preset: "bold",
    fontFamily: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
    fontSize: 56,
    fontWeight: "900",
    color: "#FFFF00",
    strokeColor: "#000000",
    strokeWidth: 5,
    backgroundColor: "transparent",
    backgroundPadding: 0,
    backgroundRadius: 0,
    position: "center",
    textAlign: "center",
    lineHeight: 1.2,
    maxWidth: 0.88,
    shadow: true,
    shadowColor: "rgba(0,0,0,1)",
    shadowBlur: 4,
    shadowOffsetX: 3,
    shadowOffsetY: 3,
    uppercase: true,
    wordHighlight: false,
    wordHighlightColor: "#FF0000",
    wordHighlightTextColor: "#FFFFFF"
  }
};
function mergeStyle(base, overrides) {
  return overrides ? { ...base, ...overrides } : base;
}
function getActiveCaptions(segments, currentTime) {
  return segments.filter(
    (seg) => currentTime >= seg.startTime && currentTime < seg.endTime
  );
}
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
function renderCaption(ctx, segment, resolvedStyle, canvasWidth, canvasHeight) {
  const style = resolvedStyle;
  const text = style.uppercase ? segment.text.toUpperCase() : segment.text;
  ctx.save();
  const scaledFontSize = style.fontSize / 1080 * canvasHeight;
  ctx.font = `${style.fontWeight} ${scaledFontSize}px ${style.fontFamily}`;
  ctx.textAlign = style.textAlign;
  ctx.textBaseline = "bottom";
  const maxPx = style.maxWidth * canvasWidth;
  const lines = wrapText(ctx, text, maxPx);
  const lineH = scaledFontSize * style.lineHeight;
  const totalH = lines.length * lineH;
  let baseY;
  if (style.position === "top") {
    baseY = scaledFontSize * 1.5;
  } else if (style.position === "center") {
    baseY = canvasHeight / 2 - totalH / 2 + lineH;
  } else {
    baseY = canvasHeight - scaledFontSize * 1.2;
  }
  const cx = canvasWidth / 2;
  lines.forEach((line, i) => {
    const y = baseY + i * lineH;
    if (style.backgroundColor && style.backgroundColor !== "transparent") {
      const metrics = ctx.measureText(line);
      const bw = metrics.width + style.backgroundPadding * 2;
      const bh = lineH + style.backgroundPadding;
      const bx = cx - bw / 2;
      const by = y - lineH;
      ctx.fillStyle = style.backgroundColor;
      if (style.backgroundRadius > 0) {
        roundRect(ctx, bx, by, bw, bh, style.backgroundRadius);
        ctx.fill();
      } else {
        ctx.fillRect(bx, by, bw, bh);
      }
    }
    if (style.shadow) {
      ctx.shadowColor = style.shadowColor;
      ctx.shadowBlur = style.shadowBlur;
      ctx.shadowOffsetX = style.shadowOffsetX;
      ctx.shadowOffsetY = style.shadowOffsetY;
    }
    if (style.strokeWidth > 0 && style.strokeColor !== "transparent") {
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeStyle = style.strokeColor;
      ctx.strokeText(line, cx, y);
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = style.color;
    ctx.fillText(line, cx, y);
  });
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// src/index.ts
init_ffmpeg();

// src/compositor.ts
var ASPECT_RATIO_MAP = {
  "16:9": [16, 9],
  "9:16": [9, 16],
  "1:1": [1, 1],
  "4:3": [4, 3],
  "3:4": [3, 4],
  original: [0, 0]
};
function resolveOutputDimensions(clip, videoWidth, videoHeight, options) {
  const ar = clip.aspectRatio ?? "original";
  const ratio = ASPECT_RATIO_MAP[ar] ?? [0, 0];
  if (ratio[0] === 0) {
    return [options.width ?? videoWidth, options.height ?? videoHeight];
  }
  const w = options.width ?? 1280;
  const h = Math.round(w * (ratio[1] / ratio[0]));
  return [w, h];
}
async function extractFrames(clip, options) {
  const fps = options.fps ?? 30;
  const onProgress = options.onProgress;
  const signal = options.signal;
  let srcUrl;
  let needsRevoke = false;
  if (typeof clip.source === "string") {
    srcUrl = clip.source;
  } else if (clip.source instanceof HTMLVideoElement) {
    srcUrl = clip.source.src;
  } else {
    srcUrl = URL.createObjectURL(clip.source);
    needsRevoke = true;
  }
  const video = document.createElement("video");
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(`Failed to load video: ${srcUrl}`));
    video.src = srcUrl;
  });
  const duration = video.duration;
  const startTime = clip.startTime ?? 0;
  const endTime = clip.endTime ?? duration;
  const clipDuration = endTime - startTime;
  const [outW, outH] = resolveOutputDimensions(
    clip,
    video.videoWidth,
    video.videoHeight,
    options
  );
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const totalFrames = Math.ceil(clipDuration * fps);
  const frames = [];
  const captionSegments = clip.captions?.segments ?? [];
  const baseStylePreset = clip.captions?.style?.preset ?? "modern";
  const baseStyle = mergeStyle(
    STYLE_PRESETS[baseStylePreset],
    clip.captions?.style
  );
  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) throw new DOMException("Render cancelled", "AbortError");
    const t = startTime + i / fps;
    await seekVideo(video, t);
    ctx.clearRect(0, 0, outW, outH);
    drawVideoFrame(ctx, video, clip, outW, outH);
    if (captionSegments.length > 0) {
      const active = getActiveCaptions(captionSegments, t - startTime);
      for (const seg of active) {
        const segStyle = mergeStyle(baseStyle, seg.style);
        renderCaption(ctx, seg, segStyle, outW, outH);
      }
    }
    const imageData = ctx.getImageData(0, 0, outW, outH);
    frames.push({ imageData, timestamp: t - startTime, width: outW, height: outH });
    if (onProgress) onProgress(i / totalFrames);
  }
  if (needsRevoke) URL.revokeObjectURL(srcUrl);
  return frames;
}
function drawVideoFrame(ctx, video, clip, outW, outH) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (clip.crop) {
    const { x, y, width, height } = clip.crop;
    ctx.drawImage(
      video,
      x * vw,
      y * vh,
      width * vw,
      height * vh,
      0,
      0,
      outW,
      outH
    );
  } else {
    const videoAR = vw / vh;
    const outAR = outW / outH;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoAR > outAR) {
      sw = vh * outAR;
      sx = (vw - sw) / 2;
    } else if (videoAR < outAR) {
      sh = vw / outAR;
      sy = (vh - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
  }
}
function seekVideo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 1e-3) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

// src/stitch.ts
async function stitchClips(clips, backend, options) {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const onProgress = options.onProgress;
  const blobs = [];
  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci];
    const clipProgress = (p) => {
      onProgress?.((ci + p * 0.9) / clips.length);
    };
    const frames = await extractFrames(clip, {
      ...options,
      width,
      height,
      fps,
      onProgress: clipProgress
    });
    const blob = await backend.encode(frames, {
      width,
      height,
      fps,
      mimeType: options.mimeType ?? "video/mp4",
      quality: options.quality ?? 0.92,
      encoderOptions: options.encoderOptions,
      onProgress: (p) => clipProgress(0.9 + p * 0.1),
      signal: options.signal
    });
    blobs.push(blob);
  }
  if (blobs.length === 1) {
    onProgress?.(1);
    return blobs[0];
  }
  return backend.concat(blobs, {
    width,
    height,
    fps,
    mimeType: options.mimeType ?? "video/mp4",
    quality: options.quality ?? 0.92,
    onProgress: (p) => onProgress?.((clips.length - 1 + p) / clips.length),
    signal: options.signal
  });
}

// src/index.ts
function createFrameWorker(config = {}) {
  const fps = config.fps ?? 30;
  const width = config.width ?? 1280;
  const height = config.height ?? 720;
  let _backend = config.backend ?? null;
  async function getBackend() {
    if (!_backend) {
      const { createFFmpegBackend: createFFmpegBackend2 } = await Promise.resolve().then(() => (init_ffmpeg(), ffmpeg_exports));
      _backend = createFFmpegBackend2();
    }
    await _backend.init();
    return _backend;
  }
  async function render(clip, options = {}) {
    const mergedOpts = { fps, width, height, ...options };
    const backend = await getBackend();
    const onProgress = mergedOpts.onProgress;
    const frames = await extractFrames(clip, {
      ...mergedOpts,
      onProgress: onProgress ? (p) => onProgress(p * 0.85) : void 0
    });
    return backend.encode(frames, {
      width: mergedOpts.width ?? width,
      height: mergedOpts.height ?? height,
      fps: mergedOpts.fps ?? fps,
      mimeType: mergedOpts.mimeType ?? "video/mp4",
      quality: mergedOpts.quality ?? 0.92,
      encoderOptions: mergedOpts.encoderOptions,
      onProgress: onProgress ? (p) => onProgress(0.85 + p * 0.15) : void 0,
      signal: mergedOpts.signal
    });
  }
  async function renderToUrl(clip, options) {
    const blob = await render(clip, options);
    return URL.createObjectURL(blob);
  }
  async function stitch(clips, options = {}) {
    const mergedOpts = { fps, width, height, ...options };
    const backend = await getBackend();
    return stitchClips(clips, backend, mergedOpts);
  }
  async function stitchToUrl(clips, options) {
    const blob = await stitch(clips, options);
    return URL.createObjectURL(blob);
  }
  return { render, renderToUrl, stitch, stitchToUrl };
}

exports.STYLE_PRESETS = STYLE_PRESETS;
exports.createFFmpegBackend = createFFmpegBackend;
exports.createFrameWorker = createFrameWorker;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map