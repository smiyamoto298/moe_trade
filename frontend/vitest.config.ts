import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// フロントエンド単体テスト（Vitest + Testing Library）の設定。
// ビルド設定（vite.config.ts）とは分離し、テスト専用の構成を持つ。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // userEvent を多用するコンポーネントテストは並列実行時に jsdom が遅くなるため余裕を持たせる
    testTimeout: 20000,
    // CSS は読み込まない（Tailwind 前提のためテストでは不要）
    css: false,
  },
})
