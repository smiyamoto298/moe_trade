import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ListingsPage from './ListingsPage'
import { listingsApi } from '../api/listings'
import { itemsApi } from '../api/items'
import client from '../api/client'
import type { Item, ItemCategory, Listing, Paginated, User } from '../types'

// design.md「検索・閲覧機能」「出品一覧のタブとルーティング」「共通UX仕様」:
// - /listings(装備品)・/skills(テクニック)・/assets(アセット)は同一コンポーネントを mode で切替し、
//   item_type パラメータでバックエンドに渡す（テクニックは skill_match=normal が既定）
// - 装備品タブは追加効果・付加効果・特殊条件、テクニックタブは必要スキル値、
//   アセットタブは設置個所・特殊機能・ストレージで絞り込む
// - 価格帯・取引方法・サーバー（複数選択）・ソート・削れあり非表示（exclude_worn）
// - 未ログイン時は「+ 出品する」「取引」を非表示にしログイン導線を表示する
// - 出品コメントがある場合はアイテム行の直下にコメント行を表示する
// - 削れあり出品は種別（カテゴリ名／⚔ 装備セット）バッジの横に「⚠ 削れあり」を表示する

vi.mock('../api/listings', () => ({ listingsApi: { list: vi.fn(), counts: vi.fn() } }))
vi.mock('../api/items', () => ({ itemsApi: { categories: vi.fn() } }))
vi.mock('../api/client', () => ({
  default: { get: vi.fn() },
  saveToken: vi.fn(),
  getToken: vi.fn(() => null),
  removeToken: vi.fn(),
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

const mockedList = vi.mocked(listingsApi.list)
const mockedCounts = vi.mocked(listingsApi.counts)
const mockedCategories = vi.mocked(itemsApi.categories)
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

const categories: ItemCategory[] = [
  {
    id: 1, parent_id: null, name: '武器', sort_order: 1,
    children: [{ id: 11, parent_id: 1, name: '刀剣', sort_order: 1 }],
  },
  {
    id: 2, parent_id: null, name: 'テクニック', sort_order: 2,
    children: [{ id: 21, parent_id: 2, name: 'ノアピース', sort_order: 1 }],
  },
  { id: 3, parent_id: null, name: 'アセット', sort_order: 3, children: [] },
  { id: 4, parent_id: null, name: '装備セット', sort_order: 4, children: [] },
]

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: 1,
  category: { id: 11, parent_id: 1, name: '刀剣', sort_order: 1 },
  name: '炎の大剣',
  description: '',
  image_url: null,
  official_url: null,
  base_stats: { atk: 100 },
  special_conditions: ['NT'],
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

const makeListing = (over: Partial<Listing> = {}): Listing => ({
  id: 1,
  user_id: 2, // 自分（id:10）以外の出品
  item: makeItem(),
  price: 5000,
  currency: 'AC',
  quantity: 1,
  trade_type: 'fixed',
  comment: '',
  status: 'active',
  expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
  servers: [{ server: 'Emerald', character_id: null, character: null }],
  created_at: new Date().toISOString(),
  ...over,
})

const page = (data: Listing[]): { data: Paginated<Listing> } => ({
  data: { data, current_page: 1, last_page: 1, per_page: 20, total: data.length },
})

function renderAt(path: '/listings' | '/all' | '/skills' | '/assets' | '/others') {
  // App.tsx と同じルーティング構成（ルートごとの key で再マウント）を再現する
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/listings" element={<ListingsPage key="equipment" mode="equipment" />} />
        <Route path="/all" element={<ListingsPage key="all" mode="all" />} />
        <Route path="/skills" element={<ListingsPage key="skill" mode="skill" />} />
        <Route path="/assets" element={<ListingsPage key="asset" mode="asset" />} />
        <Route path="/others" element={<ListingsPage key="other" mode="other" />} />
      </Routes>
    </MemoryRouter>
  )
}

// マスタ取得（スピナー）完了を待つ
const waitForLoaded = () =>
  waitFor(() => expect(screen.getByText('絞り込み')).toBeInTheDocument())

const lastParams = () => mockedList.mock.calls.at(-1)![0]

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = null
  mockedCategories.mockResolvedValue({ data: categories })
  mockedList.mockResolvedValue(page([makeListing()]))
  mockedCounts.mockResolvedValue({ data: { all: 21, equipment: 12, technique: 3, asset: 5, other: 1 } })
  mockedClientGet.mockImplementation((url: string) => {
    if (url === '/bonus-value-labels') return Promise.resolve({ data: ['物理ダメージ'] })
    if (url === '/mypage/chats') return Promise.resolve({ data: [] })
    return Promise.resolve({ data: [] })
  })
})

describe('ListingsPage タブ', () => {
  it('装備品タブは item_type=equipment で一覧を取得し、装備品の列を表示する', async () => {
    renderAt('/listings')
    await waitForLoaded()

    expect(mockedList).toHaveBeenCalledWith({ sort: 'newest', page: 1, item_type: 'equipment' })
    // 装備品の列見出し（絞り込み側のラベルと区別するため columnheader で特定）
    expect(screen.getByRole('columnheader', { name: '追加効果' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '付加効果' })).toBeInTheDocument()
    // 一覧行（アイテム名・追加効果バッジ・価格）
    expect(await screen.findByText('炎の大剣')).toBeInTheDocument()
    expect(screen.getByText(/攻撃力:/)).toBeInTheDocument()
    expect(screen.getByText('5000 AC')).toBeInTheDocument()
  })

  it('テクニックタブは item_type=technique（skill_match=normal）で取得し、必要スキル列を表示する', async () => {
    mockedList.mockResolvedValue(
      page([makeListing({ item: makeItem({ skill_requirements: { 刀剣: 80 }, mastery_requirements: ['WAR'] }) })])
    )
    renderAt('/skills')
    await waitForLoaded()

    expect(mockedList).toHaveBeenCalledWith({
      sort: 'newest', page: 1, item_type: 'technique', skill_match: 'normal',
    })
    expect(screen.getByRole('columnheader', { name: '必要スキル' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '必要マスタリ' })).toBeInTheDocument()
    // 必要スキル値と必要マスタリ（マスタリ名【コード】）の表示
    expect(await screen.findByText(/刀剣:/)).toBeInTheDocument()
    expect(screen.getByText('ウォーリアー【WAR】')).toBeInTheDocument()
  })

  it('アセットタブは item_type=asset で取得し、アセットの列と絞り込みを表示する', async () => {
    mockedList.mockResolvedValue(
      page([makeListing({
        item: makeItem({
          category: { id: 3, parent_id: null, name: 'アセット', sort_order: 3 },
          base_stats: {}, special_conditions: [],
          placement: '床', asset_width: 2, asset_height: 3,
          storage_count: 10, special_function: '銀行',
        }),
      })])
    )
    renderAt('/assets')
    await waitForLoaded()

    expect(mockedList).toHaveBeenCalledWith({ sort: 'newest', page: 1, item_type: 'asset' })
    expect(screen.getByRole('columnheader', { name: '設置・サイズ' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'ストレージ・特殊機能' })).toBeInTheDocument()
    // アセット固有の絞り込み
    expect(screen.getByText('設置個所を選択')).toBeInTheDocument()
    expect(screen.getByText('特殊機能を選択')).toBeInTheDocument()
    expect(screen.getByText('ストレージ数')).toBeInTheDocument()
    // 行のアセットパラメータ表示
    expect(await screen.findByText('床')).toBeInTheDocument()
    expect(screen.getByText('2×3')).toBeInTheDocument()
    expect(screen.getByText('銀行')).toBeInTheDocument()
  })

  it('全てタブは item_type を送らず、種別を問わず新着で表示し情報列に種別ごとの情報を出す', async () => {
    mockedList.mockResolvedValue(
      page([
        makeListing({ id: 1, item: makeItem({ id: 1, name: '炎の大剣' }) }),
        makeListing({
          id: 2,
          item: makeItem({
            id: 2,
            name: 'ノアの一撃',
            category: { id: 21, parent_id: 2, name: 'ノアピース', sort_order: 1 },
            base_stats: {}, special_conditions: [],
            skill_requirements: { 刀剣: 80 }, mastery_requirements: ['WAR'],
          }),
        }),
      ])
    )
    renderAt('/all')
    await waitForLoaded()

    // item_type を含めずに取得する（全種別が対象）
    expect(lastParams()).toEqual({ sort: 'newest', page: 1 })
    // 情報列は1列に集約
    expect(screen.getByRole('columnheader', { name: '情報' })).toBeInTheDocument()
    // 種別ラベルと両種別の中身が混在して表示される（種別ラベルはタブにも出るため表内に限定）
    expect(await screen.findByText('炎の大剣')).toBeInTheDocument()
    expect(screen.getByText('ノアの一撃')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('装備品')).toBeInTheDocument()
    expect(within(table).getByText('テクニック')).toBeInTheDocument()
    expect(within(table).getByText(/攻撃力:/)).toBeInTheDocument()
    expect(within(table).getByText(/刀剣:/)).toBeInTheDocument()
    expect(within(table).getByText('ウォーリアー【WAR】')).toBeInTheDocument()
  })

  it('全てタブの情報列は装備セットのテクニック部位を最後の「テクニック」枠でアイテム名表示する', async () => {
    // design.md「装備セット」: すべてタブの情報列では、テクニック部位は付加効果内ではなく
    // 最後の「テクニック」枠に部位カテゴリ名チップ＋アイテム名で表示する
    mockedList.mockResolvedValue(
      page([
        makeListing({
          id: 3,
          item: makeItem({
            id: 3, name: 'ヴィガーセット',
            category: { id: 4, parent_id: null, name: '装備セット', sort_order: 4 },
            is_equipment_set: true,
            base_stats: {}, special_conditions: [],
            set_members: [
              makeItem({ id: 31, name: '刀剣部位', base_stats: { atk: 10 }, special_conditions: ['NT'] }),
              makeItem({
                id: 32, name: 'ノアピース：ヴィガー',
                category: { id: 21, parent_id: 2, name: 'ノアピース', sort_order: 1 },
                base_stats: {}, special_conditions: [],
              }),
            ],
          }),
        }),
      ])
    )
    renderAt('/all')
    await waitForLoaded()

    expect(await screen.findByText('ヴィガーセット')).toBeInTheDocument()
    const table = screen.getByRole('table')
    // 情報列のラベル順: 追加効果 → 付加効果 → 特殊条件 → テクニック（最後）
    const labels = within(table)
      .getAllByText(/^(追加効果|付加効果|特殊条件|テクニック)$/)
      .map((el) => el.textContent)
    expect(labels).toEqual(['追加効果', '付加効果', '特殊条件', 'テクニック'])
    // テクニック枠に部位アイテム名が表示される
    expect(within(table).getByText('ノアピース：ヴィガー')).toBeInTheDocument()
  })

  it('各種別タブに件数バッジを表示する（counts API の結果）', async () => {
    renderAt('/listings')
    await waitForLoaded()

    expect(mockedCounts).toHaveBeenCalledWith(false)
    // 各タブのラベルと件数が同じリンク内に表示される
    const equip = await screen.findByRole('link', { name: /装備品/ })
    expect(equip).toHaveTextContent('12')
    expect(screen.getByRole('link', { name: /全て/ })).toHaveTextContent('21')
    expect(screen.getByRole('link', { name: /テクニック/ })).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: /アセット/ })).toHaveTextContent('5')
    expect(screen.getByRole('link', { name: /その他/ })).toHaveTextContent('1')
  })

  it('「取引完了を含める」を切り替えると counts を完了込みで取り直す', async () => {
    renderAt('/listings')
    await waitForLoaded()
    expect(mockedCounts).toHaveBeenCalledWith(false)

    await userEvent.click(screen.getByRole('checkbox', { name: '取引完了を含める' }))
    await waitFor(() => expect(mockedCounts).toHaveBeenCalledWith(true))
  })

  it('タブリンクで装備品→テクニックに切り替えると再マウントして再検索する', async () => {
    renderAt('/listings')
    await waitForLoaded()
    expect(lastParams()).toMatchObject({ item_type: 'equipment' })

    await userEvent.click(screen.getByRole('link', { name: /テクニック/ }))
    await waitFor(() =>
      expect(lastParams()).toEqual({
        sort: 'newest', page: 1, item_type: 'technique', skill_match: 'normal',
      })
    )
    expect(await screen.findByRole('columnheader', { name: '必要マスタリ' })).toBeInTheDocument()
  })
})

describe('ListingsPage 絞り込み（装備品タブ）', () => {
  it('アイテム名のキーワードを item_name として送信し、page を 1 に戻す', async () => {
    renderAt('/listings')
    await waitForLoaded()

    await userEvent.type(screen.getByPlaceholderText('キーワード検索'), '大剣')
    await waitFor(() => expect(lastParams()).toMatchObject({ item_name: '大剣', page: 1 }))
  })

  it('種別（カテゴリ）の選択を category_ids として送信し、「装備セットを含める」を表示する', async () => {
    renderAt('/listings')
    await waitForLoaded()

    // 通常カテゴリ選択前は「装備セットを含める」は出ない
    expect(screen.queryByRole('checkbox', { name: '装備セットを含める' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('種別を選択'))
    await userEvent.click(screen.getByRole('checkbox', { name: '刀剣' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ category_ids: [11] }))

    // 通常カテゴリが選択されたので「装備セットを含める」が出る
    await userEvent.click(screen.getByRole('checkbox', { name: '装備セットを含める' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ include_equipment_set: true }))
  })

  it('追加効果の選択を base_stat_keys として送信し、数値範囲は base_stat_ranges になる', async () => {
    renderAt('/listings')
    await waitForLoaded()

    await userEvent.click(screen.getByText('追加効果を選択'))
    await userEvent.click(screen.getByRole('checkbox', { name: '攻撃力' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ base_stat_keys: ['atk'] }))

    // 数値絞り込みエリアが出現し、最小値の入力が base_stat_ranges に反映される
    const rangeArea = screen.getByText('追加効果 — 数値絞り込み').closest('div')!
    await userEvent.type(within(rangeArea).getByPlaceholderText('最小'), '50')
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ base_stat_ranges: { atk: { min: 50 } } })
    )

    // 選択を外すと範囲もまとめて解除される
    // （範囲入力のクリックは FilterPopup の外側クリック扱いでポップアップが閉じるため開き直す）
    await userEvent.click(screen.getByText('追加効果を選択'))
    await userEvent.click(screen.getByRole('checkbox', { name: '攻撃力' }))
    await waitFor(() => {
      expect(lastParams().base_stat_keys).toBeUndefined()
      expect(lastParams().base_stat_ranges).toEqual({})
    })
  })

  it('サーバー・取引方法・価格帯・削れあり・取引完了を含めるを送信する', async () => {
    renderAt('/listings')
    await waitForLoaded()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Emerald' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ servers: ['Emerald'] }))

    await userEvent.selectOptions(screen.getByDisplayValue('すべて'), 'negotiable')
    await waitFor(() => expect(lastParams()).toMatchObject({ trade_type: 'negotiable' }))

    await userEvent.type(screen.getByPlaceholderText('最小'), '1000')
    await userEvent.type(screen.getByPlaceholderText('最大'), '9000')
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ price_min: 1000, price_max: 9000 })
    )

    await userEvent.click(screen.getByRole('checkbox', { name: '削れありを非表示' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ exclude_worn: true }))

    await userEvent.click(screen.getByRole('checkbox', { name: '取引完了を含める' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ include_completed: true }))

    // チェックを外すと servers は undefined に戻る
    await userEvent.click(screen.getByRole('checkbox', { name: 'Emerald' }))
    await waitFor(() => expect(lastParams().servers).toBeUndefined())
  })

  it('ソートの変更を sort として送信する', async () => {
    renderAt('/listings')
    await waitForLoaded()

    await userEvent.selectOptions(screen.getByDisplayValue('新着順'), 'price_asc')
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'price_asc', page: 1 }))
  })

  it('検索結果が0件のときは「出品が見つかりません」を表示する', async () => {
    mockedList.mockResolvedValue(page([]))
    renderAt('/listings')
    await waitForLoaded()
    expect(await screen.findByText('出品が見つかりません')).toBeInTheDocument()
  })
})

describe('ListingsPage 絞り込み（テクニックタブ）', () => {
  it('必要スキルの選択を skill_keys、数値範囲を skill_ranges として送信する', async () => {
    renderAt('/skills')
    await waitForLoaded()

    await userEvent.click(screen.getByText('必要スキルを選択'))
    await userEvent.click(screen.getByRole('checkbox', { name: '刀剣' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ skill_keys: ['刀剣'] }))

    const rangeArea = screen.getByText('必要スキル値 — 数値絞り込み').closest('div')!
    await userEvent.type(within(rangeArea).getByPlaceholderText('最大'), '40')
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ skill_ranges: { 刀剣: { max: 40 } } })
    )
  })

  it('通常検索ではマスタリを含めるチェックを送信でき、構成検索に切り替えると skill_match=composition になる', async () => {
    renderAt('/skills')
    await waitForLoaded()

    // 通常検索でスキルを選択するとマスタリ込みチェックが出る
    await userEvent.click(screen.getByText('必要スキルを選択'))
    await userEvent.click(screen.getByRole('checkbox', { name: '刀剣' }))
    const masteryCheck = await screen.findByRole('checkbox', {
      name: 'マスタリに含まれるスキルも対象にする',
    })
    await userEvent.click(masteryCheck)
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ skill_match: 'normal', skill_include_mastery: true })
    )

    // 構成検索へ切り替え。マスタリ込みチェックは通常検索専用なので消える
    await userEvent.click(screen.getByRole('button', { name: '構成検索' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ skill_match: 'composition' }))
    expect(
      screen.queryByRole('checkbox', { name: 'マスタリに含まれるスキルも対象にする' })
    ).not.toBeInTheDocument()
  })
})

describe('ListingsPage 絞り込み（その他タブ＝レシピ）', () => {
  it('必要スキルで絞り込めるが、テクニック専用の検索モード切替・マスタリチェックは出さない', async () => {
    renderAt('/others')
    await waitForLoaded()

    // レシピの必要スキル値で絞り込み（skill_match は送らず、バックエンド既定の通常検索になる）
    await userEvent.click(screen.getByText('必要スキルを選択'))
    await userEvent.click(screen.getByRole('checkbox', { name: '薬調合' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ item_type: 'other', skill_keys: ['薬調合'] }))
    expect(lastParams()).not.toHaveProperty('skill_match')

    // 数値範囲も skill_ranges として送れる
    const rangeArea = screen.getByText('必要スキル値 — 数値絞り込み').closest('div')!
    await userEvent.type(within(rangeArea).getByPlaceholderText('最大'), '70')
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ skill_ranges: { 薬調合: { max: 70 } } })
    )

    // テクニック専用UI（構成検索ボタン・マスタリ込みチェック）は表示されない
    expect(screen.queryByRole('button', { name: '構成検索' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'マスタリに含まれるスキルも対象にする' })
    ).not.toBeInTheDocument()
  })
})

describe('ListingsPage 絞り込み（アセットタブ）', () => {
  it('設置個所・特殊機能・ストレージ数を送信する', async () => {
    renderAt('/assets')
    await waitForLoaded()

    await userEvent.click(screen.getByText('設置個所を選択'))
    await userEvent.click(screen.getByRole('checkbox', { name: '床' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ placements: ['床'] }))

    await userEvent.click(screen.getByText('特殊機能を選択'))
    await userEvent.click(screen.getByRole('checkbox', { name: '銀行' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ special_functions: ['銀行'] }))

    // ストレージ数（最小・最大）。価格帯にも最小/最大があるため「ストレージ数」配下に絞って操作する
    const storageArea = screen.getByText('ストレージ数').closest('div')!
    await userEvent.type(within(storageArea).getByPlaceholderText('最小'), '5')
    await waitFor(() => expect(lastParams()).toMatchObject({ storage_min: 5 }))
  })
})

describe('ListingsPage 削れありバッジ', () => {
  it('削れあり出品は種別バッジの横に「⚠ 削れあり」を表示し、アイテム名の横には表示しない', async () => {
    mockedList.mockResolvedValue(page([makeListing({ is_worn: true })]))
    renderAt('/listings')
    await waitForLoaded()

    const worn = await screen.findByText('⚠ 削れあり')
    // 種別（カテゴリ名）バッジと同じ行コンテナに並ぶ
    expect(worn.parentElement).toHaveTextContent('刀剣')
    // アイテム名の要素には含まれない
    expect(screen.getByText('炎の大剣')).not.toContainElement(worn)
  })

  it('削れなしの出品にはバッジを表示しない', async () => {
    mockedList.mockResolvedValue(page([makeListing({ is_worn: false })]))
    renderAt('/listings')
    await waitForLoaded()

    await screen.findByText('炎の大剣')
    expect(screen.queryByText('⚠ 削れあり')).not.toBeInTheDocument()
  })

  it('テクニックタブでは削れありを表示しない', async () => {
    mockedList.mockResolvedValue(page([makeListing({ is_worn: true })]))
    renderAt('/skills')
    await waitForLoaded()

    await screen.findByText('炎の大剣')
    expect(screen.queryByText('⚠ 削れあり')).not.toBeInTheDocument()
  })
})

describe('ListingsPage 出品コメント行', () => {
  it('コメントがある出品はアイテム行の直下にコメント行を表示する', async () => {
    mockedList.mockResolvedValue(page([makeListing({ comment: '値下げ交渉OKです' })]))
    renderAt('/listings')
    await waitForLoaded()

    const comment = await screen.findByText('値下げ交渉OKです')
    const itemRow = screen.getByText('炎の大剣').closest('tr')!
    expect(itemRow.nextElementSibling).toContainElement(comment)
  })

  it('コメントが無い出品にはコメント行を表示しない', async () => {
    mockedList.mockResolvedValue(page([makeListing({ comment: '' })]))
    renderAt('/listings')
    await waitForLoaded()

    await screen.findByText('炎の大剣')
    const itemRow = screen.getByText('炎の大剣').closest('tr')!
    expect(itemRow.nextElementSibling).toBeNull()
  })

  it('コメントの有無が混在する一覧でも、コメントは該当する出品の行にだけ表示される', async () => {
    mockedList.mockResolvedValue(page([
      makeListing({ id: 1, comment: '即決歓迎' }),
      makeListing({ id: 2, comment: '', item: makeItem({ id: 2, name: '氷の槍' }) }),
    ]))
    renderAt('/listings')
    await waitForLoaded()

    const comment = await screen.findByText('即決歓迎')
    expect(screen.getByText('炎の大剣').closest('tr')!.nextElementSibling).toContainElement(comment)
    expect(screen.getByText('氷の槍').closest('tr')!.nextElementSibling).toBeNull()
  })
})

describe('ListingsPage ログイン状態によるアクション制御', () => {
  it('未ログイン時はログイン案内を表示し、「+ 出品する」「取引」を表示しない', async () => {
    auth.user = null
    renderAt('/listings')
    await waitForLoaded()
    await screen.findByText('炎の大剣')

    expect(screen.getByText('出品・取引希望にはログインが必要です！')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ 出品する' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取引' })).not.toBeInTheDocument()
    // 詳細リンク・相場情報は未ログインでも表示される
    expect(screen.getByRole('link', { name: '詳細 →' })).toBeInTheDocument()
  })

  it('ログイン済み（メール認証済み）は「+ 出品する」「一括出品」「取引」を表示する', async () => {
    auth.user = verifiedUser
    renderAt('/listings')
    await waitForLoaded()
    await screen.findByText('炎の大剣')

    expect(screen.queryByText('出品・取引希望にはログインが必要です！')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ 出品する' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取引' })).toBeInTheDocument()
  })

  it('自分の出品には「取引」ボタンを表示しない', async () => {
    auth.user = verifiedUser
    mockedList.mockResolvedValue(page([makeListing({ user_id: verifiedUser.id })]))
    renderAt('/listings')
    await waitForLoaded()
    await screen.findByText('炎の大剣')

    expect(screen.queryByRole('button', { name: '取引' })).not.toBeInTheDocument()
  })

  it('メール未認証のユーザーには「取引」ボタンを表示しない', async () => {
    auth.user = { ...verifiedUser, email_verified_at: null }
    renderAt('/listings')
    await waitForLoaded()
    await screen.findByText('炎の大剣')

    expect(screen.queryByRole('button', { name: '取引' })).not.toBeInTheDocument()
  })
})
