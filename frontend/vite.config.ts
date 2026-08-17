import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * ビルドごとに一意な識別子。ビルド時に __BUILD_ID__ として焼き込み、
 * 同じ値を dist/version.json にも出力する。クライアントは両者を比較して
 * 「開きっぱなしで古くなったフロント」を検知し、更新を促す（utils/appUpdate.ts）。
 * git hash はコミット漏れ時に同値になるため、ビルド時刻を採用する。
 */
const buildId = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    define: { __BUILD_ID__: JSON.stringify(buildId) },
    plugins: [
      react(),
      {
        // 最新ビルドIDの配信元。dist 直下に置くので deploy の tar にそのまま乗る
        name: 'emit-version-json',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ build: buildId }),
          })
        },
      },
    ],
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
