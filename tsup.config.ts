import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external: ['@ffmpeg/ffmpeg', '@ffmpeg/util', 'react', 'react-dom'],
    esbuildOptions(options) {
      options.conditions = ['browser'];
    },
  },
  {
    entry: {
      'react/index': 'src/react/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: ['@ffmpeg/ffmpeg', '@ffmpeg/util', 'react', 'react-dom', '..'],
    esbuildOptions(options) {
      options.conditions = ['browser'];
    },
  },
  {
    // Worker bundle: self-contained ESM module loaded via new Worker(new URL(...))
    entry: {
      'render-worker': 'src/worker/render-worker.ts',
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    // No externals — bundle captions.ts and everything else into the worker
    external: [],
    platform: 'browser',
    esbuildOptions(options) {
      options.conditions = ['browser'];
    },
  },
]);
