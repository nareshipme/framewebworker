interface CaptionSegment {
    text: string;
    startTime: number;
    endTime: number;
    style?: Partial<CaptionStyle>;
}
type CaptionStylePreset = 'hormozi' | 'modern' | 'minimal' | 'bold';
interface CaptionStyle {
    preset: CaptionStylePreset;
    fontFamily: string;
    fontSize: number;
    fontWeight: string | number;
    color: string;
    strokeColor: string;
    strokeWidth: number;
    backgroundColor: string;
    backgroundPadding: number;
    backgroundRadius: number;
    position: 'top' | 'center' | 'bottom';
    textAlign: CanvasTextAlign;
    lineHeight: number;
    maxWidth: number;
    shadow: boolean;
    shadowColor: string;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    uppercase: boolean;
    wordHighlight: boolean;
    wordHighlightColor: string;
    wordHighlightTextColor: string;
}
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | 'original';
interface CropOptions {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface CaptionOptions {
    segments: CaptionSegment[];
    style?: Partial<CaptionStyle>;
}
interface ClipInput {
    /** Video source: URL string, File, Blob, or HTMLVideoElement */
    source: string | File | Blob | HTMLVideoElement;
    /** Trim start in seconds (default: 0) */
    startTime?: number;
    /** Trim end in seconds (default: video duration) */
    endTime?: number;
    /** Captions to overlay */
    captions?: CaptionOptions;
    /** Crop settings */
    crop?: CropOptions;
    /** Output aspect ratio */
    aspectRatio?: AspectRatio;
    /** Volume multiplier 0-2 (default: 1) */
    volume?: number;
}
interface RenderOptions {
    /** Output width in pixels (default: 1280) */
    width?: number;
    /** Output height in pixels (default: 720) */
    height?: number;
    /** Frames per second (default: 30) */
    fps?: number;
    /** Output MIME type (default: 'video/mp4') */
    mimeType?: string;
    /** Quality 0-1 for non-ffmpeg backends (default: 0.92) */
    quality?: number;
    /** Additional codec/format options passed to the backend */
    encoderOptions?: Record<string, unknown>;
    /** Progress callback (0-1) */
    onProgress?: (progress: number) => void;
    /** AbortSignal to cancel rendering */
    signal?: AbortSignal;
}
interface EncodeOptions {
    width: number;
    height: number;
    fps: number;
    mimeType: string;
    quality: number;
    encoderOptions?: Record<string, unknown>;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
}
interface FrameData {
    imageData: ImageData;
    timestamp: number;
    width: number;
    height: number;
}
/** Pluggable renderer backend interface */
interface RendererBackend {
    /** Human-readable backend name */
    name: string;
    /** Initialize the backend (load WASM, etc.) */
    init(): Promise<void>;
    /** Encode an array of frames into a video Blob */
    encode(frames: FrameData[], options: EncodeOptions): Promise<Blob>;
    /** Concatenate multiple video Blobs */
    concat(blobs: Blob[], options: EncodeOptions): Promise<Blob>;
    /** Optional cleanup */
    destroy?(): Promise<void>;
}
interface FrameWorkerConfig {
    /** Renderer backend (default: ffmpeg.wasm) */
    backend?: RendererBackend;
    /** Default FPS (default: 30) */
    fps?: number;
    /** Default output width */
    width?: number;
    /** Default output height */
    height?: number;
}
interface FrameWorker {
    /** Render a single clip to a Blob */
    render(clip: ClipInput, options?: RenderOptions): Promise<Blob>;
    /** Render a single clip and return an object URL */
    renderToUrl(clip: ClipInput, options?: RenderOptions): Promise<string>;
    /** Stitch multiple clips into one Blob */
    stitch(clips: ClipInput[], options?: RenderOptions): Promise<Blob>;
    /** Stitch multiple clips and return an object URL */
    stitchToUrl(clips: ClipInput[], options?: RenderOptions): Promise<string>;
}

declare const STYLE_PRESETS: Record<CaptionStylePreset, CaptionStyle>;

declare class FFmpegBackend implements RendererBackend {
    readonly name = "ffmpeg.wasm";
    private ffmpeg;
    private initialized;
    private _fetchFile;
    init(): Promise<void>;
    encode(frames: FrameData[], options: EncodeOptions): Promise<Blob>;
    concat(blobs: Blob[], options: EncodeOptions): Promise<Blob>;
    destroy(): Promise<void>;
}
declare function createFFmpegBackend(): FFmpegBackend;

declare function createFrameWorker(config?: FrameWorkerConfig): FrameWorker;

export { type AspectRatio, type CaptionOptions, type CaptionSegment, type CaptionStyle, type CaptionStylePreset, type ClipInput, type CropOptions, type EncodeOptions, FFmpegBackend, type FrameData, type FrameWorker, type FrameWorkerConfig, type RenderOptions, type RendererBackend, STYLE_PRESETS, createFFmpegBackend, createFrameWorker };
