import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'dist',
    lib: {
      entry: 'app/server.ts',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [
        'node:fs',
        'node:path',
        'node:crypto',
        'node:stream',
        'node:buffer',
        'node:util',
        'node:events',
        'node:url',
        'node:string_decoder',
        'node:querystring',
      ]
    }
  }
})
