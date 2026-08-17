import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

// ルーティングのみを検証するため、レイアウト・ページ本体はスタブに差し替える
vi.mock('./components/Header', () => ({ default: () => null }))
vi.mock('./components/Footer', () => ({ default: () => null }))
vi.mock('./components/SideBanners', () => ({ default: () => null }))
vi.mock('./components/TourOverlay', () => ({ default: () => null }))
vi.mock('./components/HelpButton', () => ({ default: () => null }))
vi.mock('./components/UpdateBanner', () => ({ default: () => null }))
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
