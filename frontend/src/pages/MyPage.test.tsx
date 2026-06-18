import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MyPage from './MyPage'

// design.md「マイページ」: 一覧＋チャットの2カラムグリッドは
// `lg:grid-cols-[minmax(0,1fr)_420px]` とする。`1fr`（= minmax(auto,1fr)）だと
// truncate（nowrap）な長いメッセージプレビューの固有最小幅で左カラムが広がり、
// 右の420pxチャットパネルがページ外へはみ出してレイアウトが崩れる。

// テストごとに /mypage/listings・/mypage/buy-requests の戻り値を差し替えるための可変ストア
const mockData = vi.hoisted(() => ({
  listings: [] as any[],
  buyRequests: [] as any[],
}))

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (url === '/mypage/listings') {
        return Promise.resolve({ data: { data: mockData.listings } })
      }
      if (url === '/mypage/buy-requests') {
        return Promise.resolve({ data: { data: mockData.buyRequests } })
      }
      if (url === '/mypage/selling-chats' || url === '/mypage/buy-request-chats') {
        return Promise.resolve({ data: {} })
      }
      return Promise.resolve({ data: [] })
    }),
  },
  saveToken: vi.fn(),
  getToken: vi.fn(() => null),
  removeToken: vi.fn(),
}))
vi.mock('../api/listings', () => ({ listingsApi: { renew: vi.fn(), cancel: vi.fn() } }))
vi.mock('../api/buyRequests', () => ({ buyRequestsApi: { renew: vi.fn(), cancel: vi.fn() } }))
vi.mock('../api/characters', () => ({ charactersApi: { upsert: vi.fn(), remove: vi.fn() } }))
vi.mock('../api/mock', () => ({
  USE_MOCK: false,
  mockChats: [],
  MOCK_MY_USER_ID: 99,
  MOCK_MY_LISTING_IDS: [],
}))
vi.mock('../components/ChatThread', () => ({ default: () => <div /> }))
vi.mock('../components/EditTradeModal', () => ({ default: () => <div /> }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 10, email: 'hashed', role: 'user', is_suspended: false, characters: [] },
    loading: false,
    refresh: vi.fn(),
  }),
}))
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    unreadChatIds: new Set<number>(),
    unreadListingIds: new Set<number>(),
    unreadBuyRequestIds: new Set<number>(),
    markAsRead: vi.fn(),
    notifPermission: 'granted',
    requestNotifPermission: vi.fn(),
  }),
}))
vi.mock('../contexts/DialogContext', () => ({
  useDialog: () => ({ confirm: vi.fn(), alert: vi.fn() }),
}))
vi.mock('../tours/TourContext', () => ({
  useTour: () => ({ resetAllTours: vi.fn(), startTour: vi.fn() }),
}))

const expiredItem = (id: number, status = 'expired') => ({
  id,
  status,
  price: 1000,
  currency: 'AC',
  trade_type: 'fixed',
  expires_at: new Date(Date.now() - 86400000).toISOString(),
  item: { id, name: `アイテム${id}`, category: { name: '武器' } },
  servers: [],
})

describe('MyPage', () => {
  beforeEach(() => {
    mockData.listings = []
    mockData.buyRequests = []
  })

  it('一覧＋チャットのグリッドは minmax(0,1fr) で左カラムの広がりを防ぐ', async () => {
    const { container } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      const grid = container.querySelector('.grid.items-start')
      expect(grid).not.toBeNull()
      expect(grid!.className).toContain('lg:grid-cols-[minmax(0,1fr)_420px]')
    })
  })

  it('期限切れの出品・買取があるとマイページに通知バナーを表示する', async () => {
    mockData.listings = [expiredItem(1)]
    mockData.buyRequests = [expiredItem(2)]

    const { getByText } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(getByText('期限切れの取引があります')).toBeTruthy()
      expect(getByText(/出品 1件・買取 1件/)).toBeTruthy()
    })
  })

  it('status=active でも expires_at が過去なら出品中でなく期限切れ扱いにする（残り日数マイナスを出さない）', async () => {
    // 毎時バッチ未実行・遅延で status=active のまま期限超過したレコードを想定
    mockData.listings = [expiredItem(3, 'active')]

    const { getByText, queryByText } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      // 期限切れバナー＋期限切れセクションの再出品ボタンが出る
      expect(getByText('期限切れの取引があります')).toBeTruthy()
      expect(getByText('再出品')).toBeTruthy()
    })
    // 「残り-N日」の出品中カードは出さない
    expect(queryByText(/残り-?\d+日/)).toBeNull()
  })

  it('期限切れが無ければ通知バナーを表示しない', async () => {
    const { queryByText } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      // 読み込み完了（出品なしの空表示）を待ってからバナー非表示を確認
      expect(queryByText('出品中のアイテムはありません')).toBeTruthy()
    })
    expect(queryByText('期限切れの取引があります')).toBeNull()
  })
})
