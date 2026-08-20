import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BuyRequestsPage from './BuyRequestsPage'
import { buyRequestsApi } from '../api/buyRequests'
import client from '../api/client'
import type { BuyRequest, Item, Paginated, User } from '../types'

// design.md「3-B. 買取機能（買いたい）」:
// - 買取一覧は出品一覧と同様のテーブルレイアウト（アイテム／取引／価格／操作列）で表示する
// - 各行に「取引」ボタン（行下に取引希望パネルを展開）と「相場情報」ボタン（PC）／「詳細 →」リンク（狭い幅）を用意する
// - 買取一覧では装備性能・確認ステータスは表示せず、アイテム名・取引条件・価格のみを表示する
// - 未ログイン時・メール未認証・自分の買取・申し出済みの行には「取引」ボタンを出さない
// - コメントがある買取はアイテム行の直下にコメント行を表示する

vi.mock('../api/buyRequests', () => ({
  buyRequestsApi: { list: vi.fn(), createChat: vi.fn() },
}))
vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  saveToken: vi.fn(),
  getToken: vi.fn(() => null),
  removeToken: vi.fn(),
}))
// 相場情報モーダルは内部で相場APIを叩くためスタブ化する
vi.mock('../components/PriceAnalyticsModal', () => ({
  default: ({ itemName }: { itemName: string }) => <div>相場モーダル: {itemName}</div>,
}))

// ログイン状態はテストごとに auth.user を差し替える
const auth = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: auth.user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}))

const mockedList = vi.mocked(buyRequestsApi.list)
const mockedClientGet = vi.mocked(client.get)

// ---- フィクスチャ ----

const verifiedUser: User = {
  id: 10,
  email: 'hashed',
  role: 'user',
  is_suspended: false,
  email_verified_at: '2026-01-01T00:00:00Z',
  register_ip: null,
  characters: [],
}

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: 1,
  category: { id: 11, parent_id: 1, name: '刀剣', sort_order: 1 },
  name: '炎の大剣',
  description: '',
  image_url: null,
  official_url: null,
  base_stats: {},
  special_conditions: [],
  dyeable: null,
  mithril: false,
  is_equipment_set: false,
  set_piece_category_ids: null,
  skill_requirements: null,
  mastery_requirements: null,
  verified_status: 'verified',
  submitted_by: null,
  locked_by_staff: false,
  bonus_effects: [],
  ...over,
})

const makeBuyRequest = (over: Partial<BuyRequest> = {}): BuyRequest => ({
  id: 1,
  user_id: 2, // 自分（id:10）以外の買取
  item: makeItem(),
  price: 5000,
  currency: 'AC',
  quantity: 1,
  trade_type: 'fixed',
  comment: '',
  status: 'active',
  expires_at: new Date(Date.now() + 20 * 86400000).toISOString(),
  servers: [{ server: 'Emerald', character_id: null, character: null }],
  created_at: new Date().toISOString(),
  ...over,
})

const page = (data: BuyRequest[]): { data: Paginated<BuyRequest> } => ({
  data: { data, current_page: 1, last_page: 1, per_page: 20, total: data.length },
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/buy-requests']}>
      <BuyRequestsPage />
    </MemoryRouter>
  )

const lastParams = () => mockedList.mock.calls.at(-1)![0]

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = null
  mockedList.mockResolvedValue(page([makeBuyRequest()]))
  mockedClientGet.mockImplementation((url: string) => {
    if (url === '/mypage/selling-offers') return Promise.resolve({ data: [] })
    return Promise.resolve({ data: [] })
  })
})

describe('BuyRequestsPage テーブル表示', () => {
  it('出品一覧と同様のテーブルレイアウト（アイテム・取引・価格列）で買取を表示する', async () => {
    renderPage()

    expect(await screen.findByText('炎の大剣')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'アイテム' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '取引' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '価格' })).toBeInTheDocument()
    // 行の中身: 種別（カテゴリ名）・買取希望価格・取引方法
    expect(screen.getByText('刀剣')).toBeInTheDocument()
    expect(screen.getByText('買取希望')).toBeInTheDocument()
    expect(screen.getByText('5,000 AC')).toBeInTheDocument()
    expect(screen.getByText('即決')).toBeInTheDocument()
  })

  it('オークションの買取は現在価格・入札数・即決価格を表示する', async () => {
    mockedList.mockResolvedValue(page([makeBuyRequest({
      trade_type: 'auction', price: 9000, current_price: 7000, bid_count: 2, buyout_price: 5000,
    })]))
    renderPage()

    expect(await screen.findByText('現在価格')).toBeInTheDocument()
    expect(screen.getByText('7,000 AC')).toBeInTheDocument()
    expect(screen.getByText('🔨 オークション')).toBeInTheDocument()
    expect(screen.getByText(/入札 2件/)).toBeInTheDocument()
    expect(screen.getByText(/即決 5,000/)).toBeInTheDocument()
  })

  it('検索結果が0件のときは「該当する買取はありません。」を表示する', async () => {
    mockedList.mockResolvedValue(page([]))
    renderPage()
    expect(await screen.findByText('該当する買取はありません。')).toBeInTheDocument()
  })

  it('コメントがある買取はアイテム行の直下にコメント行を表示する', async () => {
    mockedList.mockResolvedValue(page([makeBuyRequest({ comment: '高価買取します' })]))
    renderPage()

    const comment = await screen.findByText('高価買取します')
    const itemRow = screen.getByText('炎の大剣').closest('tr')!
    expect(itemRow.nextElementSibling).toContainElement(comment)
  })

  it('コメントが無い買取にはコメント行を表示しない', async () => {
    renderPage()

    await screen.findByText('炎の大剣')
    const itemRow = screen.getByText('炎の大剣').closest('tr')!
    expect(itemRow.nextElementSibling).toBeNull()
  })
})

describe('BuyRequestsPage 検索・ソート', () => {
  it('アイテム名の検索を item_name として送信し、page を 1 に戻す', async () => {
    renderPage()
    await screen.findByText('炎の大剣')

    await userEvent.type(screen.getByPlaceholderText('アイテム名で検索（部分一致）'), '大剣')
    await userEvent.click(screen.getByRole('button', { name: '検索' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ item_name: '大剣', page: 1 }))
  })

  it('貼り付けたアイテム一覧を item_names として送信する', async () => {
    renderPage()
    await screen.findByText('炎の大剣')

    await userEvent.click(screen.getByText('▼ 複数のアイテム名で絞り込む（一覧を貼り付け）'))
    await userEvent.type(screen.getByPlaceholderText(/レンタル/), '炎の大剣{enter}氷の槍')
    await userEvent.click(screen.getByRole('button', { name: '読込' }))
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ item_names: ['炎の大剣', '氷の槍'], page: 1 })
    )
  })

  it('ソートの変更を sort として送信する', async () => {
    renderPage()
    await screen.findByText('炎の大剣')

    await userEvent.selectOptions(screen.getByDisplayValue('新着順'), 'price_desc')
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'price_desc', page: 1 }))
  })
})

describe('BuyRequestsPage 操作列（取引・相場情報・詳細）', () => {
  it('未ログイン時は「取引」「買取する」を表示せず、詳細リンク・相場情報は表示する', async () => {
    auth.user = null
    renderPage()
    await screen.findByText('炎の大剣')

    expect(screen.queryByRole('button', { name: '取引' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '買取する' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '詳細 →' })).toHaveAttribute('href', '/buy-requests/1')
    expect(screen.getByRole('button', { name: '相場情報' })).toBeInTheDocument()
  })

  it('ログイン済み（メール認証済み）は「取引」を表示し、押すと行下に取引希望パネルを展開する', async () => {
    auth.user = verifiedUser
    renderPage()
    await screen.findByText('炎の大剣')

    await userEvent.click(screen.getByRole('button', { name: '取引' }))
    // TradeRequestPanel（買取向け）が展開され、サーバー選択が表示される
    expect(await screen.findByText(/取引するサーバー/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Emerald/ })).toBeInTheDocument()

    // キャンセルで閉じる（パネル下部のキャンセルボタン）
    await userEvent.click(screen.getAllByRole('button', { name: 'キャンセル' }).at(-1)!)
    await waitFor(() => expect(screen.queryByText(/取引するサーバー/)).not.toBeInTheDocument())
  })

  it('メール未認証のユーザーには「取引」ボタンを表示しない', async () => {
    auth.user = { ...verifiedUser, email_verified_at: null }
    renderPage()
    await screen.findByText('炎の大剣')

    expect(screen.queryByRole('button', { name: '取引' })).not.toBeInTheDocument()
  })

  it('自分の買取には「取引」ボタンを表示しない', async () => {
    auth.user = verifiedUser
    mockedList.mockResolvedValue(page([makeBuyRequest({ user_id: verifiedUser.id })]))
    renderPage()
    await screen.findByText('炎の大剣')

    expect(screen.queryByRole('button', { name: '取引' })).not.toBeInTheDocument()
  })

  it('売却を申し出済みの買取は「✓ 申出済み」を表示し「取引」ボタンを出さない', async () => {
    auth.user = verifiedUser
    mockedClientGet.mockImplementation((url: string) => {
      if (url === '/mypage/selling-offers') return Promise.resolve({ data: [{ buy_request_id: 1 }] })
      return Promise.resolve({ data: [] })
    })
    renderPage()
    await screen.findByText('炎の大剣')

    expect(await screen.findByText('✓ 申出済み')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取引' })).not.toBeInTheDocument()
  })

  it('「相場情報」を押すと相場ポップアップを開く', async () => {
    renderPage()
    await screen.findByText('炎の大剣')

    await userEvent.click(screen.getByRole('button', { name: '相場情報' }))
    expect(await screen.findByText('相場モーダル: 炎の大剣')).toBeInTheDocument()
  })
})

// design.md「出品一覧・買取一覧の表示モード（詳細 / シンプル）」:
// - 出品一覧と同じトグル・同じ保存キー（moe_list_display_mode）を使う
// - シンプル表示はアイテム名・取引可能サーバー・価格・ボタン（取引／相場情報）だけを表示する
describe('BuyRequestsPage 表示モード（詳細 / シンプル）', () => {
  it('既定は詳細表示で、種別・取引方法・期限・コメントを表示する', async () => {
    mockedList.mockResolvedValue(page([makeBuyRequest({ comment: '高価買取します' })]))
    renderPage()
    await screen.findByText('炎の大剣')

    expect(screen.getByRole('button', { name: '詳細' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('columnheader', { name: '取引' })).toBeInTheDocument()
    expect(screen.getByText('刀剣')).toBeInTheDocument()
    expect(screen.getByText('即決')).toBeInTheDocument()
    expect(screen.getByText(/残り\d+日/)).toBeInTheDocument()
    expect(screen.getByText('高価買取します')).toBeInTheDocument()
  })

  it('シンプルに切り替えるとアイテム名・サーバー・価格・ボタンだけになる', async () => {
    auth.user = verifiedUser
    mockedList.mockResolvedValue(page([makeBuyRequest({ comment: '高価買取します' })]))
    renderPage()
    await screen.findByText('炎の大剣')

    await userEvent.click(screen.getByRole('button', { name: 'シンプル' }))

    expect(screen.getByText('炎の大剣')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'サーバー' })).toBeInTheDocument()
    expect(screen.getByTitle('Emerald')).toBeInTheDocument()
    expect(screen.getByText('5,000 AC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取引' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '相場情報' })).toBeInTheDocument()

    expect(screen.queryByRole('columnheader', { name: '取引' })).not.toBeInTheDocument()
    expect(screen.queryByText('刀剣')).not.toBeInTheDocument()
    expect(screen.queryByText('即決')).not.toBeInTheDocument()
    expect(screen.queryByText(/残り\d+日/)).not.toBeInTheDocument()
    expect(screen.queryByText('高価買取します')).not.toBeInTheDocument()
  })

  it('出品一覧で保存したシンプル表示を引き継ぐ', async () => {
    localStorage.setItem('moe_list_display_mode', 'compact')
    renderPage()
    await screen.findByText('炎の大剣')

    expect(screen.getByRole('button', { name: 'シンプル' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('columnheader', { name: 'サーバー' })).toBeInTheDocument()
  })
})
