// @ts-check
import typescript from '@rollup/plugin-typescript';
import pkg from './package.json' assert { type: 'json' };

export default {
  input: 'src/index.ts',
  output: [{
    file: pkg.exports.require,
    sourcemap: false,
    format: 'cjs',
  }],
  external: [
    'node:fs',
    'node:fs/promises',
    'node:path',
    /node_modules/,
  ],
  plugins: [
    typescript({
      declaration: true,
      sourceMap: false,
    }),
  ],
};
