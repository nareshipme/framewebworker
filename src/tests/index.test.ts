import { describe, it, expect } from 'vitest';
import { createFrameWorker } from '../index.js';

describe('createFrameWorker', () => {
  it('returns an object with render, renderToUrl, stitch, stitchToUrl', () => {
    const fw = createFrameWorker();
    expect(typeof fw.render).toBe('function');
    expect(typeof fw.renderToUrl).toBe('function');
    expect(typeof fw.stitch).toBe('function');
    expect(typeof fw.stitchToUrl).toBe('function');
  });

  it('accepts config overrides', () => {
    const fw = createFrameWorker({ fps: 60, width: 1920, height: 1080 });
    expect(fw).toBeDefined();
  });
});
