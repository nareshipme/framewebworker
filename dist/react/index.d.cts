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

interface UseRenderState {
    progress: number;
    isRendering: boolean;
    error: Error | null;
    blob: Blob | null;
    url: string | null;
}
interface UseRenderActions {
    render: (clip: ClipInput, options?: Omit<RenderOptions, 'onProgress' | 'signal'>) => Promise<Blob | null>;
    cancel: () => void;
    reset: () => void;
}
type UseRenderResult = UseRenderState & UseRenderActions;
declare function useRender(frameWorker: FrameWorker): UseRenderResult;

interface UseStitchState {
    progress: number;
    isRendering: boolean;
    error: Error | null;
    blob: Blob | null;
    url: string | null;
}
interface UseStitchActions {
    stitch: (clips: ClipInput[], options?: Omit<RenderOptions, 'onProgress' | 'signal'>) => Promise<Blob | null>;
    cancel: () => void;
    reset: () => void;
}
type UseStitchResult = UseStitchState & UseStitchActions;
declare function useStitch(frameWorker: FrameWorker): UseStitchResult;

export { type UseRenderActions, type UseRenderResult, type UseRenderState, type UseStitchActions, type UseStitchResult, type UseStitchState, useRender, useStitch };
