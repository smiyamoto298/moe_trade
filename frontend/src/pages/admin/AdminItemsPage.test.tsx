import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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

vi.mock('../../api/items', () => ({
  itemsApi: { list: vi.fn(), categories: vi.fn() },
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'hashed', role: 'admin', is_suspended: false, email_verified_at: '2026-01-01T00:00:00Z', register_ip: null, characters: [] },
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
  exclusive_skill: false,
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

// 構成部位（通常アイテムとして登録され、equipment_set_members でセットに紐付く）
const pieceHead = makeItem({ id: 101, name: '騎士セットの頭' })
const pieceBody = makeItem({
  id: 102,
  name: '騎士セットの胴',
  category: { id: 12, parent_id: 1, name: '胴(防)', sort_order: 2 },
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/items']}>
      <AdminItemsPage />
    </MemoryRouter>
  )
}

const waitForLoaded = async () => {
  await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
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

  it('装備セット行の追加効果列は部位アイコンを表示し、本体の旧base_statsは表示しない', async () => {
    renderPage()
    await waitForLoaded()

    const row = (await screen.findByText('騎士セット')).closest('tr')!
    // 構成部位の部位カテゴリ名チップ（ホバーで部位アイテム名）
    expect(within(row).getByText('頭(防)')).toBeInTheDocument()
    expect(within(row).getByText('胴(防)')).toBeInTheDocument()
    expect(within(row).getByTitle('騎士セットの頭')).toBeInTheDocument()
    expect(within(row).getByTitle('騎士セットの胴')).toBeInTheDocument()
    // セット本体自身の base_stats（旧データ）は表示しない
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
