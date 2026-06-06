import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    watch: {
      usePolling: true,   // Windows + Docker で必要
      interval: 500,
    },
    proxy: {
      '/api': {
        target: 'http://php:9000',
        changeOrigin: true,
      },
    },
  },
})
