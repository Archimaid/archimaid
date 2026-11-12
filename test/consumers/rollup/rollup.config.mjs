import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rmSync } from 'node:fs';

// Hashed chunk names change between builds, and Rollup leaves earlier ones in place.
rmSync(new URL('./dist', import.meta.url), { recursive: true, force: true });

export default {
  input: 'src/main.js',
  output: { dir: 'dist', format: 'es', entryFileNames: 'main.js' },
  plugins: [nodeResolve({ browser: true }), commonjs()],
  onwarn(warning, warn) {
    // Mermaid's dependencies contain circular imports and top-level `this`, which Rollup reports but handles.
    if (warning.code === 'CIRCULAR_DEPENDENCY' || warning.code === 'THIS_IS_UNDEFINED') return;
    warn(warning);
  },
};
