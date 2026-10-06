import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    chunkSizeWarningLimit: 2500,
    target: 'es2020',
  },
  server: {
    port: 5173,
    open: false,
  },
})
