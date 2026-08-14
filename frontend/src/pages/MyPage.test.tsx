import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
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
  buyingChats: [] as any[],
  sellingOffers: [] as any[],
  sellingChats: {} as Record<number, any[]>,
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
      if (url === '/mypage/selling-chats') {
        return Promise.resolve({ data: mockData.sellingChats })
      }
      if (url === '/mypage/buy-request-chats') {
        return Promise.resolve({ data: {} })
      }
      if (url === '/mypage/chats') {
        return Promise.resolve({ data: mockData.buyingChats })
      }
      if (url === '/mypage/selling-offers') {
        return Promise.resolve({ data: mockData.sellingOffers })
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
vi.mock('../components/ChatThread', () => ({ default: ({ chat }: any) => <div data-testid="chat-thread">chat-{chat.id}</div> }))
vi.mock('../components/EditTradeModal', () => ({ default: () => <div /> }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 10, email: 'hashed', role: 'user', is_suspended: false, characters: [] },
    loading: false,
    refresh: vi.fn(),
  }),
}))
// 通知状態はテストごとに差し替える（granted / denied / OFF の分岐を検証するため）
const notifState = vi.hoisted(() => ({
  permission: 'granted',
  supported: true,
  optedOut: false,
  disablePush: vi.fn(),
  enablePush: vi.fn(),
}))
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    unreadChatIds: new Set<number>(),
    unreadListingIds: new Set<number>(),
    unreadBuyRequestIds: new Set<number>(),
    unreadOutbidChatIds: new Set<number>(),
    outbidChats: [],
    markOutbidSeen: vi.fn(),
    markAsRead: vi.fn(),
    notifPermission: notifState.permission,
    notifSupported: notifState.supported,
    pushEnabled: true,
    pushOptedOut: notifState.optedOut,
    disablePush: notifState.disablePush,
    enablePush: notifState.enablePush,
    requestNotifPermission: vi.fn(),
  }),
}))
const dialogMocks = vi.hoisted(() => ({ confirm: vi.fn(), alert: vi.fn() }))
vi.mock('../contexts/DialogContext', () => ({
  useDialog: () => dialogMocks,
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
    mockData.buyingChats = []
    mockData.sellingOffers = []
    mockData.sellingChats = {}
    notifState.permission = 'granted'
    notifState.supported = true
    notifState.optedOut = false
    notifState.disablePush.mockClear()
    notifState.enablePush.mockClear()
    dialogMocks.alert.mockClear()
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

  it('通知許可済みで Web Push 購読済みなら「プッシュ配信中」を表示する', async () => {
    const { getByText } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(getByText(/通知ON（プッシュ配信中）/)).toBeTruthy()
    })
  })

  it('通知ON中は「OFFにする」ボタンを表示し、押すと購読を解除する', async () => {
    const { getByText } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    const btn = await waitFor(() => getByText('OFFにする'))
    fireEvent.click(btn)
    expect(notifState.disablePush).toHaveBeenCalled()
  })

  it('通知OFF中は「ONに戻す」ボタンを表示し、押すと再購読する', async () => {
    notifState.optedOut = true
    const { getByText, queryByText } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    const btn = await waitFor(() => getByText(/通知OFF — ONに戻す/))
    expect(queryByText(/通知ON（プッシュ配信中）/)).toBeNull()
    fireEvent.click(btn)
    expect(notifState.enablePush).toHaveBeenCalled()
  })

  it('通知ブロック時は解除方法ボタンを表示し、押すと手順ダイアログを開く', async () => {
    notifState.permission = 'denied'
    const { getByText } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    const btn = await waitFor(() => getByText(/通知がブロックされています（解除方法）/))
    fireEvent.click(btn)
    expect(dialogMocks.alert).toHaveBeenCalledWith(
      expect.stringContaining('ブロックされています'),
      expect.objectContaining({ title: '通知ブロックの解除方法' })
    )
  })

  it('通知API非対応のブラウザでは「プッシュ通知を利用するには」の案内ボタンを表示する', async () => {
    notifState.permission = 'denied'
    notifState.supported = false
    const { getByText } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    const btn = await waitFor(() => getByText(/プッシュ通知を利用するには/))
    fireEvent.click(btn)
    expect(dialogMocks.alert).toHaveBeenCalledWith(
      expect.stringContaining('対応していません'),
      expect.objectContaining({ title: 'プッシュ通知を利用するには' })
    )
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

  it('取引希望チャット一覧に出品の取引金額を表示する', async () => {
    mockData.buyingChats = [{
      id: 1,
      listing_id: 5,
      buyer_id: 10,
      server: 'P',
      status: 'open',
      updated_at: new Date().toISOString(),
      messages: [],
      listing: {
        id: 5,
        price: 12345,
        currency: 'AC',
        item: { id: 5, name: 'テスト剣', category: { name: '武器' } },
        servers: [],
      },
    }]

    const { getByText } = render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    )
    // 取引希望タブへ切り替え
    fireEvent.click(getByText('取引希望'))
    await waitFor(() => {
      expect(getByText('テスト剣')).toBeTruthy()
      expect(getByText(/12,345 AC/)).toBeTruthy()
    })
  })

  // design.md §8 Web Push: 新着メッセージ通知のクリックは /mypage?chat=<chat_id> に遷移し、
  // マイページは読み込み完了後に該当チャットのタブへ切り替えてそのチャットを開く
  it('?chat=ID で取引希望チャットをタブ切り替えして開く（Push通知のディープリンク）', async () => {
    mockData.buyingChats = [{
      id: 42,
      listing_id: 5,
      buyer_id: 10,
      server: 'P',
      status: 'open',
      updated_at: new Date().toISOString(),
      messages: [],
      listing: {
        id: 5,
        price: 100,
        currency: 'AC',
        item: { id: 5, name: 'テスト剣', category: { name: '武器' } },
        servers: [],
      },
    }]

    const { getByTestId, getAllByText } = render(
      <MemoryRouter initialEntries={['/mypage?chat=42']}>
        <MyPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      // チャットパネルが対象チャットで開き、取引希望タブに切り替わっている
      // （「テスト剣」は取引希望タブの一覧行とチャットパネルのヘッダーの2箇所に出る）
      expect(getByTestId('chat-thread').textContent).toBe('chat-42')
      expect(getAllByText('テスト剣').length).toBeGreaterThan(0)
    })
  })

  it('?chat=ID で自分の出品への取引希望チャット（出品タブ側）も開く', async () => {
    mockData.listings = [{
      id: 5,
      status: 'active',
      price: 1000,
      currency: 'AC',
      trade_type: 'fixed',
      expires_at: new Date(Date.now() + 86400000 * 3).toISOString(),
      item: { id: 5, name: '出品中の盾', category: { name: '防具' } },
      servers: [],
    }]
    mockData.sellingChats = {
      5: [{
        id: 7,
        listing_id: 5,
        buyer_id: 20,
        server: 'P',
        status: 'open',
        updated_at: new Date().toISOString(),
        messages: [],
      }],
    }

    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/mypage?chat=7']}>
        <MyPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(getByTestId('chat-thread').textContent).toBe('chat-7')
    })
  })

  it('?chat=ID が存在しないチャットならチャットは開かず通常表示にする', async () => {
    const { queryByTestId, queryByText } = render(
      <MemoryRouter initialEntries={['/mypage?chat=999']}>
        <MyPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(queryByText('出品中のアイテムはありません')).toBeTruthy()
    })
    expect(queryByTestId('chat-thread')).toBeNull()
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
