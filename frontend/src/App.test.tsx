import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
// コード分割ポリシーを静的に検査するため、App.tsx のソースそのものを文字列で取り込む
import appSource from './App.tsx?raw'

// ルーティングのみを検証するため、レイアウト・ページ本体はスタブに差し替える
vi.mock('./components/Header', () => ({ default: () => null }))
vi.mock('./components/Footer', () => ({ default: () => null }))
vi.mock('./components/SideBanners', () => ({ default: () => null }))
vi.mock('./components/TourOverlay', () => ({ default: () => null }))
vi.mock('./components/HelpButton', () => ({ default: () => null }))
vi.mock('./components/UpdateBanner', () => ({ default: () => null }))
vi.mock('./components/PushBlockedBanner', () => ({ default: () => null }))
vi.mock('./components/InstallAppButton', () => ({ default: () => null }))
vi.mock('./pages/ListingsPage', () => ({
  default: ({ mode }: { mode: string }) => <div data-testid="listings">mode:{mode}</div>,
}))
vi.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
}

describe('App のルーティング', () => {
  it('ホーム(/) は全種別横断の /all へリダイレクトする', () => {
    renderAt('/')

    // /all は ListingsPage を mode="all" で描画する
    expect(screen.getByTestId('listings')).toHaveTextContent('mode:all')
  })

  it('/all は全種別横断で表示する', () => {
    renderAt('/all')

    expect(screen.getByTestId('listings')).toHaveTextContent('mode:all')
  })

  it('/listings は装備品タブのまま維持する', () => {
    renderAt('/listings')

    expect(screen.getByTestId('listings')).toHaveTextContent('mode:equipment')
  })
})

/*
 * 初回バンドルを小さく保つためのコード分割ポリシーの回帰防止。
 * ページを追加するとき静的 import で書いてしまうと、そのページのコードが
 * 全訪問者の初回ダウンロードに乗ってしまうため、機械的に検出する。
 */
describe('App のコード分割', () => {
  it('入口の ListingsPage 以外のページは lazy で読み込む', () => {
    // `import XxxPage from './pages/...'` の形で残っている静的 import を洗い出す
    const staticPageImports = [
      ...appSource.matchAll(/^import\s+(\w+)\s+from\s+'\.\/pages\/.+'$/gm),
    ].map((m) => m[1])

    expect(staticPageImports).toEqual(['ListingsPage'])
  })

  it('遅延ルートは読み込み中にスピナーを出してから本体を描画する', async () => {
    renderAt('/terms')

    // 同期レンダー時点ではチャンク未取得＝Suspense の fallback が出ている（＝遅延している証拠）
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '利用規約' })).toBeInTheDocument()
  })
})
