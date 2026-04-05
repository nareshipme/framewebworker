import { describe, it, expect } from 'vitest';
import { STYLE_PRESETS, mergeStyle, getActiveCaptions } from '../captions.js';
import type { CaptionSegment } from '../types.js';

describe('STYLE_PRESETS', () => {
  it('has all required presets', () => {
    expect(STYLE_PRESETS).toHaveProperty('hormozi');
    expect(STYLE_PRESETS).toHaveProperty('modern');
    expect(STYLE_PRESETS).toHaveProperty('minimal');
    expect(STYLE_PRESETS).toHaveProperty('bold');
  });

  it('hormozi preset uses uppercase', () => {
    expect(STYLE_PRESETS.hormozi.uppercase).toBe(true);
  });
});

describe('mergeStyle', () => {
  it('returns base style unchanged when no overrides', () => {
    const result = mergeStyle(STYLE_PRESETS.modern);
    expect(result).toEqual(STYLE_PRESETS.modern);
  });

  it('overrides individual properties', () => {
    const result = mergeStyle(STYLE_PRESETS.modern, { color: '#FF0000', fontSize: 80 });
    expect(result.color).toBe('#FF0000');
    expect(result.fontSize).toBe(80);
    expect(result.fontFamily).toBe(STYLE_PRESETS.modern.fontFamily);
  });
});

describe('getActiveCaptions', () => {
  const segments: CaptionSegment[] = [
    { text: 'Hello', startTime: 0, endTime: 2 },
    { text: 'World', startTime: 2, endTime: 4 },
    { text: 'Overlap', startTime: 1, endTime: 3 },
  ];

  it('returns captions active at t=0', () => {
    const active = getActiveCaptions(segments, 0);
    expect(active.map((s) => s.text)).toEqual(['Hello']);
  });

  it('returns overlapping captions at t=1.5', () => {
    const active = getActiveCaptions(segments, 1.5);
    expect(active.map((s) => s.text)).toContain('Hello');
    expect(active.map((s) => s.text)).toContain('Overlap');
  });

  it('excludes captions at their exact endTime', () => {
    const active = getActiveCaptions(segments, 2);
    expect(active.map((s) => s.text)).not.toContain('Hello');
    expect(active.map((s) => s.text)).toContain('World');
  });

  it('returns empty array when nothing is active', () => {
    const active = getActiveCaptions(segments, 10);
    expect(active).toHaveLength(0);
  });
});
