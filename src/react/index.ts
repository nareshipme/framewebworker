// v0.2 hooks
export { useExportClips } from './useExportClips.js';
export type { UseExportClipsResult } from './useExportClips.js';

export { useMergeClips } from './useMergeClips.js';
export type { UseMergeClipsResult, UseMergeClipsState, UseMergeClipsActions } from './useMergeClips.js';

export { usePreviewClip } from './useRender.js';
export type { UsePreviewClipResult, UsePreviewClipState, UsePreviewClipActions } from './useRender.js';

// Deprecated aliases (kept for soft migration — will be removed in v0.3)
/** @deprecated Use useExportClips() */
export { useExportClips as useRender } from './useExportClips.js';
/** @deprecated Use useMergeClips() */
export { useMergeClips as useStitch } from './useMergeClips.js';
/** @deprecated Use usePreviewClip() */
export { usePreviewClip as useClipRender } from './useRender.js';
export type { UseClipRenderResult, UseClipRenderState, UseClipRenderActions } from './useRender.js';
export type { UseStitchResult, UseStitchState, UseStitchActions } from './useStitch.js';
