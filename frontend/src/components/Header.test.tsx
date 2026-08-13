import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Header from './Header'

// design.md「ローカル開発環境 > ローカル環境の視覚的識別」:
// ローカル開発中（import.meta.env.DEV）は本番画面と取り違えないよう、
// 画面両脇（左右端）に黄色の縦枠線を常時表示する。本番ビルドでは表示されない。

const mockAuth = vi.hoisted(() => ({
  user: null as { role: string } | null,
  logout: vi.fn(),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
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
  mockAuth.user = null
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

// design.md「レイアウト・ブランド表示 > ヘッダーのナビ構成」:
// 並び順は マイ取引 → アイテムボックス → 出品一覧 → 買取一覧 → アイテム一覧 →
// お問い合わせ → 管理。デスクトップ・モバイルドロワーとも同一順。
describe('Header ナビの並び順', () => {
  const LOGGED_IN_ORDER = [
    'マイ取引',
    'アイテムボックス',
    '出品一覧',
    '買取一覧',
    'アイテム一覧',
    'お問い合わせ',
  ]

  // nav 内のリンクテキストを DOM 順で取り出す（バッジ等の付随テキストは除外して比較する）
  const linkTexts = (nav: HTMLElement) =>
    within(nav)
      .getAllByRole('link')
      .map((el) => LOGGED_IN_ORDER.find((label) => el.textContent?.includes(label)))
      .filter((label): label is string => label !== undefined)

  it('未ログイン時は 出品一覧 → 買取一覧 → アイテム一覧 の順で表示する', () => {
    renderHeader()
    const nav = screen.getByRole('navigation')
    expect(linkTexts(nav)).toEqual(['出品一覧', '買取一覧', 'アイテム一覧'])
  })

  it('ログイン時はマイ取引・アイテムボックスを先頭に、お問い合わせを末尾に表示する（デスクトップ）', () => {
    mockAuth.user = { role: 'user' }
    renderHeader()
    const nav = screen.getByRole('navigation')
    expect(linkTexts(nav)).toEqual(LOGGED_IN_ORDER)
  })

  it('admin では お問い合わせ の後ろに管理メニューを表示する（デスクトップ）', () => {
    mockAuth.user = { role: 'admin' }
    renderHeader()
    const nav = screen.getByRole('navigation')
    const adminButton = within(nav).getByRole('button', { name: /管理/ })
    const boardLink = within(nav).getByRole('link', { name: /お問い合わせ/ })
    // compareDocumentPosition: FOLLOWING = 対象ノードが基準ノードより後方にある
    expect(boardLink.compareDocumentPosition(adminButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('モバイルドロワーもデスクトップと同一順で表示する', () => {
    mockAuth.user = { role: 'user' }
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    // ドロワーを開くと nav が2つ（デスクトップ・モバイル）になる。後者がドロワー
    const navs = screen.getAllByRole('navigation')
    expect(navs.length).toBe(2)
    expect(linkTexts(navs[1])).toEqual(LOGGED_IN_ORDER)
  })
})
