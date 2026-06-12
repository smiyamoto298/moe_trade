import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      host: true,
      watch: {
        usePolling: true,   // Windows + Docker で必要
        interval: 500,
      },
      proxy: {
        '/api': {
          // 通常の開発アクセスは nginx(:80) が /api を直接 php-fpm へ渡すため、この proxy は通らない。
          // ホストで直接 vite を起動して検証する場合は API_PROXY_TARGET=http://localhost を指定する（frontend/.env.local）
          target: env.API_PROXY_TARGET || 'http://php:9000',
          changeOrigin: true,
        },
      },
    },
  }
})
