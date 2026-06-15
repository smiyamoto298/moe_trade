import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OwnedItemsPage from './OwnedItemsPage'
import { itemsApi } from '../api/items'
import { saveInventory, loadInitialInventory } from '../utils/inventoryStore'
import type { Item, InventoryData } from '../types'

// design.md「所有アイテム管理 > 貼り付け取り込み」:
// 一覧を表示するタイミングで、未紐づけ（itemId=null）の行を /api/items/match で
// 登録アイテムへ再照合し、一致したものを自動でリンクして保存する。
// 末尾「...」の省略名は誤紐づけ防止のため対象外。

vi.mock('../api/items', () => ({ itemsApi: { matchNames: vi.fn() } }))
vi.mock('../api/buyRequests', () => ({ buyRequestsApi: { prices: vi.fn(() => Promise.resolve({ data: {} })) } }))
vi.mock('../api/excludedItems', () => ({ excludedItemsApi: { list: vi.fn(() => Promise.resolve({ data: [] })), report: vi.fn(() => Promise.resolve()) } }))
vi.mock('../api/client', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: {} })) } }))
vi.mock('../utils/inventoryStore', () => ({
  getStorageMode: vi.fn(() => 'local'),
  loadInitialInventory: vi.fn(),
  saveInventory: vi.fn(() => Promise.resolve()),
  persistStorageMode: vi.fn(() => Promise.resolve()),
  getSkipExcludeConfirm: vi.fn(() => false),
  setSkipExcludeConfirm: vi.fn(),
}))
vi.mock('../hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('../contexts/DialogContext', () => ({
  useDialog: () => ({ confirm: vi.fn(), alert: vi.fn() }),
}))
vi.mock('../components/NewItemForm', () => ({ default: () => <div /> }))
vi.mock('../components/CandidateSelectModal', () => ({ default: () => <div /> }))
vi.mock('../components/PriceAnalyticsModal', () => ({ default: () => <div /> }))
vi.mock('../components/equipmentCells', () => ({ BaseStatBadges: () => <div /> }))

const mockedMatch = vi.mocked(itemsApi.matchNames)
const mockedLoad = vi.mocked(loadInitialInventory)
const mockedSave = vi.mocked(saveInventory)

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: 12,
  category: { id: 11, parent_id: 1, name: '刀剣', sort_order: 1 },
  name: '炎の大剣',
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

const makeInventory = (items: InventoryData['items']): InventoryData => ({
  accounts: [{ id: 'acc1', name: 'メイン' }],
  items,
  exclusions: [],
})

const unlinkedRow = (over: Partial<InventoryData['items'][number]> = {}): InventoryData['items'][number] => ({
  id: 'row1',
  accountId: 'acc1',
  no: '1',
  name: '炎の大剣',
  category: '刀剣',
  count: 1,
  itemId: null,
  item: null,
  worn: false,
  dyed: false,
  marked: false,
  ...over,
})

const renderPage = () => render(<MemoryRouter><OwnedItemsPage /></MemoryRouter>)

describe('OwnedItemsPage 自動再紐づけ', () => {
  beforeEach(() => vi.clearAllMocks())

  it('表示時、未紐づけ行を再照合して一致したものをリンクし保存する', async () => {
    mockedLoad.mockResolvedValue({ mode: 'local', data: makeInventory([unlinkedRow()]) })
    mockedMatch.mockResolvedValue({ data: { '炎の大剣': makeItem() } })

    renderPage()

    await waitFor(() => expect(mockedMatch).toHaveBeenCalledWith(['炎の大剣']))
    // 紐づけ結果が保存される
    await waitFor(() => {
      const saved = mockedSave.mock.calls.at(-1)?.[1] as InventoryData
      expect(saved.items[0].itemId).toBe(12)
      expect(saved.items[0].item?.name).toBe('炎の大剣')
    })
  })

  it('末尾「...」の省略名は再照合の対象にしない', async () => {
    mockedLoad.mockResolvedValue({ mode: 'local', data: makeInventory([unlinkedRow({ name: '炎の大...' })]) })
    mockedMatch.mockResolvedValue({ data: {} })

    renderPage()

    // 省略名しか無いので match は呼ばれない
    await waitFor(() => expect(mockedLoad).toHaveBeenCalled())
    expect(mockedMatch).not.toHaveBeenCalled()
  })

  it('既に紐づけ済みの行は再照合しない', async () => {
    mockedLoad.mockResolvedValue({
      mode: 'local',
      data: makeInventory([unlinkedRow({ itemId: 12, item: makeItem() })]),
    })

    renderPage()

    await waitFor(() => expect(mockedLoad).toHaveBeenCalled())
    expect(mockedMatch).not.toHaveBeenCalled()
  })
})
