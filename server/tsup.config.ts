import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Native / binary-shipping packages must stay external and be resolved at runtime.
  external: ['sharp', 'ffmpeg-static', 'ffprobe-static', 'fluent-ffmpeg', 'pdfjs-dist'],
  noExternal: [/@fileflow\/shared/],
});
