import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MyPage from './MyPage'

// design.md「マイページ」: 一覧＋チャットの2カラムグリッドは
// `lg:grid-cols-[minmax(0,1fr)_420px]` とする。`1fr`（= minmax(auto,1fr)）だと
// truncate（nowrap）な長いメッセージプレビューの固有最小幅で左カラムが広がり、
// 右の420pxチャットパネルがページ外へはみ出してレイアウトが崩れる。

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (url === '/mypage/listings' || url === '/mypage/buy-requests') {
        return Promise.resolve({ data: { data: [] } })
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

describe('MyPage', () => {
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
})
