import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  ssr: {
    external: ['node_modules', 'node:*']
  },
  build: {
    target: 'esnext',
    emptyOutDir: false,
    lib: {
      formats: ['cjs'],
      entry: resolve('./src/index.ts'),
      name: 'vitePluginDeadFile',
      fileName: 'index.cjs',
    },
    rollupOptions: {
      external: ['@swc/core', 'node_modules'],
      output: {
      },
    },
  },
})
