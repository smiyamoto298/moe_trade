import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AdminItemsPage from './AdminItemsPage'
import { itemsApi } from '../../api/items'
import type { Item, ItemCategory } from '../../types'

// design.md「管理機能」:
// - アイテム管理（装備品タブ）に「装備セットを展開表示」チェックボックスを表示（デフォルトOFF）
//   - チェックなし: 装備セット本体のみ表示し、構成部位アイテムは表示しない
//   - チェックあり: 構成部位アイテムを表示し、装備セット本体は表示しない
//   - セットに属さない通常アイテムはどちらでも表示する
// - テクニック/アセットタブにはチェックボックスを表示しない
// - 装備セット行の追加効果列は構成部位のアイコン（部位カテゴリ名チップ・ホバーで部位名）を表示し、
//   セット本体自身の旧 base_stats は表示しない
// - 行操作はアイコンボタン（title=aria-label）。相場登録・削除は admin のみ、
//   編集・コピーは editor 以上（編集のみ、一般ユーザーは自分の未確認・staff未編集アイテムも可）
// - コピーはコピー元IDつきの新規作成画面（/admin/items/new?copy=<id>）へ遷移する

vi.mock('../../api/items', () => ({
  itemsApi: { list: vi.fn(), categories: vi.fn() },
}))

// テストごとにロールを切り替えられる認証モック
const auth = vi.hoisted(() => ({ user: null as unknown }))
const makeUser = (role: 'user' | 'editor' | 'admin', id = 1) => ({
  id, email: 'hashed', role, is_suspended: false, email_verified_at: '2026-01-01T00:00:00Z', register_ip: null, characters: [],
})

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: auth.user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    unverifiedEquipmentCount: 0,
    unverifiedTechniqueCount: 0,
    unverifiedAssetCount: 0,
    unverifiedOtherCount: 0,
  }),
}))

const mockedList = vi.mocked(itemsApi.list)
const mockedCategories = vi.mocked(itemsApi.categories)

const categories: ItemCategory[] = [
  {
    id: 1, parent_id: null, name: '防具', sort_order: 1,
    children: [
      { id: 11, parent_id: 1, name: '頭(防)', sort_order: 1 },
      { id: 12, parent_id: 1, name: '胴(防)', sort_order: 2 },
    ],
  },
  { id: 2, parent_id: null, name: 'テクニック', sort_order: 2, children: [] },
  { id: 3, parent_id: null, name: 'アセット', sort_order: 3, children: [] },
  { id: 4, parent_id: null, name: '装備セット', sort_order: 4, children: [] },
]

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: 1,
  category: { id: 11, parent_id: 1, name: '頭(防)', sort_order: 1 },
  name: '通常アイテム',
  description: '',
  image_url: null,
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

// 構成部位（通常アイテムとして登録され、equipment_set_members でセットに紐付く）。
// 出品一覧と同じく、追加効果・付加効果は部位（set_members）から組み立てて表示する。
const knightBonus = (id: number): Item['bonus_effects'][number] => ({
  id,
  effect_name: '騎士の守り',
  type: { id: 1, type_key: 'defense_up', label: '防御強化', category: 'defense' },
  values: [{ label: '防御', value: 5, value_unit: '%' }],
  description: '',
})
const pieceHead = makeItem({
  id: 101,
  name: '騎士セットの頭',
  base_stats: { def: 30 },
  bonus_effects: [knightBonus(901)],
})
const pieceBody = makeItem({
  id: 102,
  name: '騎士セットの胴',
  category: { id: 12, parent_id: 1, name: '胴(防)', sort_order: 2 },
  base_stats: { def: 30 },
  bonus_effects: [knightBonus(902)],
})
// セット本体（set_members に部位を持つ。base_stats は旧データで一覧には表示しない）
const setItem = makeItem({
  id: 100,
  name: '騎士セット',
  category: { id: 4, parent_id: null, name: '装備セット', sort_order: 4 },
  is_equipment_set: true,
  set_piece_category_ids: [11, 12],
  set_members: [pieceHead, pieceBody],
  base_stats: { atk: 99 },
})
const normalItem = makeItem({ id: 1, name: '炎の大剣' })

// 遷移先のパス＋クエリ＋state を表示するだけのプローブ（コピー遷移の検証用）
function LocationProbe() {
  const location = useLocation()
  return (
    <div>
      <div data-testid="location">{location.pathname + location.search}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </div>
  )
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/items']}>
      <Routes>
        <Route path="/items" element={<AdminItemsPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  )
}

const waitForLoaded = async () => {
  await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = makeUser('admin')
  mockedCategories.mockResolvedValue({ data: categories })
  // 一覧APIはセット本体・構成部位・通常アイテムをすべて返す
  mockedList.mockResolvedValue({ data: [normalItem, setItem, pieceHead, pieceBody] })
})

describe('AdminItemsPage 装備セットを展開表示', () => {
  it('デフォルト（チェックなし）はセット本体と通常アイテムを表示し、構成部位は表示しない', async () => {
    renderPage()
    await waitForLoaded()

    const checkbox = screen.getByRole('checkbox', { name: '装備セットを展開表示' })
    expect(checkbox).not.toBeChecked()

    expect(await screen.findByText('騎士セット')).toBeInTheDocument()
    expect(screen.getByText('炎の大剣')).toBeInTheDocument()
    expect(screen.queryByText('騎士セットの頭')).not.toBeInTheDocument()
    expect(screen.queryByText('騎士セットの胴')).not.toBeInTheDocument()
  })

  it('チェックすると構成部位と通常アイテムを表示し、セット本体は表示しない', async () => {
    renderPage()
    await waitForLoaded()

    await userEvent.click(screen.getByRole('checkbox', { name: '装備セットを展開表示' }))

    expect(await screen.findByText('騎士セットの頭')).toBeInTheDocument()
    expect(screen.getByText('騎士セットの胴')).toBeInTheDocument()
    expect(screen.getByText('炎の大剣')).toBeInTheDocument()
    expect(screen.queryByText('騎士セット')).not.toBeInTheDocument()
  })

  it('チェックを外すと元の表示（セット本体のみ）に戻る', async () => {
    renderPage()
    await waitForLoaded()

    const checkbox = screen.getByRole('checkbox', { name: '装備セットを展開表示' })
    await userEvent.click(checkbox)
    await userEvent.click(checkbox)

    expect(await screen.findByText('騎士セット')).toBeInTheDocument()
    expect(screen.queryByText('騎士セットの頭')).not.toBeInTheDocument()
  })

  it('テクニック・アセットタブではチェックボックスを表示しない', async () => {
    renderPage()
    await waitForLoaded()

    await userEvent.click(screen.getByRole('button', { name: 'テクニック' }))
    expect(screen.queryByRole('checkbox', { name: '装備セットを展開表示' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'アセット' }))
    expect(screen.queryByRole('checkbox', { name: '装備セットを展開表示' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '装備品' }))
    expect(screen.getByRole('checkbox', { name: '装備セットを展開表示' })).toBeInTheDocument()
  })

  it('装備セット行は出品一覧と同じ表示（部位チップ・構成部位の追加効果/付加効果）にする', async () => {
    renderPage()
    await waitForLoaded()

    const row = (await screen.findByText('騎士セット')).closest('tr')!
    // アイテム名の下に構成部位の部位カテゴリ名チップを表示する
    expect(within(row).getByText('頭(防)')).toBeInTheDocument()
    expect(within(row).getByText('胴(防)')).toBeInTheDocument()
    // 追加効果・付加効果は構成部位（set_members）から表示する
    expect(within(row).getByText(/防御力/)).toBeInTheDocument()
    expect(within(row).getByText('騎士の守り')).toBeInTheDocument()
    // セット本体自身の base_stats（旧データ・atk=99）は表示しない
    expect(within(row).queryByText(/攻撃力/)).not.toBeInTheDocument()
  })

  it('件数タブ（すべて/未確認/確認済み）は表示中のアイテムに連動する', async () => {
    renderPage()
    await waitForLoaded()

    // チェックなし: 通常アイテム + セット本体 = 2件
    expect(screen.getByRole('button', { name: 'すべて (2)' })).toBeInTheDocument()

    // チェックあり: 通常アイテム + 部位2件 = 3件
    await userEvent.click(screen.getByRole('checkbox', { name: '装備セットを展開表示' }))
    expect(await screen.findByRole('button', { name: 'すべて (3)' })).toBeInTheDocument()
  })
})

describe('AdminItemsPage 取引情報の表示', () => {
  it('デフォルト（チェックあり）で各行に出品数・買取数を表示し、外すと非表示になる', async () => {
    const tradedItem = makeItem({ id: 1, name: '炎の大剣', active_listing_count: 3, active_buy_request_count: 2 })
    mockedList.mockResolvedValue({ data: [tradedItem] })
    renderPage()
    await waitForLoaded()

    // デフォルトは表示（チェックあり）
    const checkbox = screen.getByRole('checkbox', { name: '取引情報を表示' })
    expect(checkbox).toBeChecked()
    const row = (await screen.findByText('炎の大剣')).closest('tr')!
    expect(within(row).getByText('出品 3')).toBeInTheDocument()
    expect(within(row).getByText('買取 2')).toBeInTheDocument()

    // チェックを外すと取引情報を表示しない
    await userEvent.click(checkbox)
    expect(screen.queryByText('出品 3')).not.toBeInTheDocument()
  })

  it('件数が無いアイテムは出品0・買取0を表示する', async () => {
    mockedList.mockResolvedValue({ data: [makeItem({ id: 1, name: '炎の大剣' })] })
    renderPage()
    await waitForLoaded()

    const row = (await screen.findByText('炎の大剣')).closest('tr')!
    expect(within(row).getByText('出品 0')).toBeInTheDocument()
    expect(within(row).getByText('買取 0')).toBeInTheDocument()
  })
})

describe('AdminItemsPage 行操作アイコン', () => {
  const rowFor = async (name: string) => (await screen.findByText(name)).closest('tr')!

  it('アイテム名はアイテム恒久ページ /items/:id への公開リンクになっている', async () => {
    renderPage()
    await waitForLoaded()

    // 名前リンク（id=1 の通常アイテム）をクリックすると公開詳細ページへ遷移する
    await userEvent.click(screen.getByRole('link', { name: '炎の大剣' }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/items/1')
  })

  it('admin は確認済み行に相場登録・編集・コピー・削除のアイコンを表示する', async () => {
    renderPage()
    await waitForLoaded()

    const row = await rowFor('炎の大剣')
    expect(within(row).getByRole('button', { name: '相場登録' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'コピー' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '削除' })).toBeInTheDocument()
  })

  it('editor は編集・コピーのみ表示し、admin 限定の相場登録・削除は表示しない', async () => {
    auth.user = makeUser('editor')
    renderPage()
    await waitForLoaded()

    const row = await rowFor('炎の大剣')
    expect(within(row).getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'コピー' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '相場登録' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('一般ユーザーは自分の未確認アイテムにのみ編集を表示し、コピーは表示しない', async () => {
    auth.user = makeUser('user', 9)
    const ownItem = makeItem({ id: 50, name: '自分の登録アイテム', verified_status: 'unverified', submitted_by: 9 })
    mockedList.mockResolvedValue({ data: [normalItem, ownItem] })
    renderPage()
    await waitForLoaded()

    // 自分が登録した未確認（staff未編集）アイテム → 編集のみ
    const ownRow = await rowFor('自分の登録アイテム')
    expect(within(ownRow).getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(within(ownRow).queryByRole('button', { name: 'コピー' })).not.toBeInTheDocument()
    expect(within(ownRow).queryByRole('button', { name: '相場登録' })).not.toBeInTheDocument()
    expect(within(ownRow).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()

    // 他人のアイテム → 操作なし
    const otherRow = await rowFor('炎の大剣')
    expect(within(otherRow).queryByRole('button')).not.toBeInTheDocument()
  })

  it('未ログイン時は操作アイコンを表示しない', async () => {
    auth.user = null
    renderPage()
    await waitForLoaded()

    const row = await rowFor('炎の大剣')
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })

  it('コピーをクリックすると名前変更ダイアログが開き、確定でコピー元IDつきの新規作成画面へ遷移する', async () => {
    renderPage()
    await waitForLoaded()

    const row = await rowFor('炎の大剣')
    await userEvent.click(within(row).getByRole('button', { name: 'コピー' }))

    // ダイアログが開き、プレビューに元の名前が表示される
    expect(screen.getByRole('heading', { name: 'コピーして編集' })).toBeInTheDocument()
    expect(screen.getByText('コピー後の名前')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'コピーして編集' }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/admin/items/new?copy=1')
  })

  it('コピーダイアログで置換・末尾追加を入力するとセット名・各部位名のプレビューが変わり、確定で state に渡る', async () => {
    renderPage()
    await waitForLoaded()

    const row = await rowFor('騎士セット')
    await userEvent.click(within(row).getByRole('button', { name: 'コピー' }))

    await userEvent.type(screen.getByRole('textbox', { name: '置換対象 1' }), '騎士')
    await userEvent.type(screen.getByRole('textbox', { name: '置換後 1' }), '女王')
    await userEvent.type(screen.getByRole('textbox', { name: '末尾に追加' }), '(染色可)')

    // プレビュー：セット名と各部位アイテム名それぞれに置換＋末尾追加が適用される
    expect(screen.getByText('女王セット(染色可)')).toBeInTheDocument()
    expect(screen.getByText('・女王セットの頭(染色可)')).toBeInTheDocument()
    expect(screen.getByText('・女王セットの胴(染色可)')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'コピーして編集' }))

    expect(await screen.findByTestId('location')).toHaveTextContent('/admin/items/new?copy=100')
    const state = JSON.parse(screen.getByTestId('location-state').textContent!)
    expect(state.copyRename).toEqual({
      replacements: [{ search: '騎士', replace: '女王' }],
      suffix: '(染色可)',
    })
  })

  it('「+ 置換を追加」で置換を増やすと上から順に適用され、×で行を削除できる', async () => {
    renderPage()
    await waitForLoaded()

    const row = await rowFor('騎士セット')
    await userEvent.click(within(row).getByRole('button', { name: 'コピー' }))

    // 1行目は削除ボタンを表示しない（最低1行は残す）
    expect(screen.queryByRole('button', { name: '置換を削除 1' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: '置換対象 1' }), '騎士')
    await userEvent.type(screen.getByRole('textbox', { name: '置換後 1' }), '女王')
    await userEvent.click(screen.getByRole('button', { name: '+ 置換を追加' }))
    await userEvent.type(screen.getByRole('textbox', { name: '置換対象 2' }), 'の頭')
    await userEvent.type(screen.getByRole('textbox', { name: '置換後 2' }), 'のヘルム')

    // 2つの置換が順に適用される（部位名: 騎士セットの頭 → 女王セットのヘルム）
    expect(screen.getByText('・女王セットのヘルム')).toBeInTheDocument()
    expect(screen.getByText('・女王セットの胴')).toBeInTheDocument()

    // 2行目を削除すると1つ目の置換だけが残る
    await userEvent.click(screen.getByRole('button', { name: '置換を削除 2' }))
    expect(screen.getByText('・女王セットの頭')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'コピーして編集' }))
    const state = JSON.parse((await screen.findByTestId('location-state')).textContent!)
    expect(state.copyRename).toEqual({
      replacements: [{ search: '騎士', replace: '女王' }],
      suffix: '',
    })
  })
})
