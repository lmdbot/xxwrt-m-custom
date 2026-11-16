import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Embedded at bundle time, so About never mistakes the current date for build time.
  define: { __XXWRT_BUILD_AT__: JSON.stringify(new Date().toISOString()) },
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist'
  }
})
