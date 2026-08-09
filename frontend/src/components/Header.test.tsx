import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Header from './Header'

// design.md「ローカル開発環境 > ローカル環境の視覚的識別」:
// ローカル開発中（import.meta.env.DEV）は本番画面と取り違えないよう、
// 画面両脇（左右端）に黄色の縦枠線を常時表示する。本番ビルドでは表示されない。

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}))
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    totalUnread: 0,
    expiredCount: 0,
    hasNewBoard: false,
    unverifiedItemCount: 0,
    unorganizedLabelCount: 0,
    excludedSuggestionCount: 0,
    announcements: [],
    markAnnouncementRead: vi.fn(),
  }),
}))
vi.mock('../contexts/DialogContext', () => ({
  useDialog: () => ({ confirm: vi.fn(), alert: vi.fn() }),
}))
vi.mock('../api/dev', () => ({ devApi: { pullProd: vi.fn() } }))
vi.mock('./VerifyEmailBanner', () => ({ default: () => null }))

const renderHeader = () =>
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  )

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Header ローカル環境の視覚的識別', () => {
  it('ローカル環境（DEV）では画面両脇に枠線を表示する', () => {
    // vitest 実行時は import.meta.env.DEV が既定で true
    renderHeader()
    expect(screen.getByTestId('local-env-frame-left')).toBeInTheDocument()
    expect(screen.getByTestId('local-env-frame-right')).toBeInTheDocument()
  })

  it('本番ビルド（DEV=false）では枠線を表示しない', () => {
    vi.stubEnv('DEV', false)
    renderHeader()
    expect(screen.queryByTestId('local-env-frame-left')).not.toBeInTheDocument()
    expect(screen.queryByTestId('local-env-frame-right')).not.toBeInTheDocument()
  })

  it('ヘッダー背景に旧方式の黄色オーバーレイを付けない', () => {
    renderHeader()
    const header = screen.getByRole('banner')
    expect(header.style.backgroundImage).toBe('')
  })
})
