// Vitest 共通セットアップ。
// - jest-dom のカスタムマッチャ（toBeInTheDocument 等）を有効化
// - 各テスト後に DOM と localStorage をクリーンアップ
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
