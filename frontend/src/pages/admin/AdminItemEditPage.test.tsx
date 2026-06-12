import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminItemEditPage from './AdminItemEditPage'
import { itemsApi } from '../../api/items'
import type { Item, ItemCategory } from '../../types'

// design.md「管理機能」コピーして編集（editor / admin）:
// - /admin/items/new?copy=<id> でコピー元アイテムを取得し、入力内容を複製した新規作成フォームを表示する
// - 見出しは「アイテムをコピーして追加」。保存時は新規アイテムとして登録する（create を呼び、update は呼ばない）
// - editor 未満（一般ユーザー）はコピーを利用できず、一覧へ戻される

vi.mock('../../api/items', () => ({
  itemsApi: { categories: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), verify: vi.fn() },
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

const alertMock = vi.hoisted(() => vi.fn())
vi.mock('../../contexts/DialogContext', () => ({
  useDialog: () => ({ alert: alertMock, confirm: vi.fn() }),
}))

vi.mock('../../hooks/useBonusValueLabels', () => ({
  useBonusValueLabels: () => [],
}))

const mockedCategories = vi.mocked(itemsApi.categories)
const mockedGet = vi.mocked(itemsApi.get)
const mockedCreate = vi.mocked(itemsApi.create)
const mockedUpdate = vi.mocked(itemsApi.update)

const categories: ItemCategory[] = [
  {
    id: 1, parent_id: null, name: '防具', sort_order: 1,
    children: [
      { id: 11, parent_id: 1, name: '頭(防)', sort_order: 1 },
    ],
  },
  { id: 2, parent_id: null, name: 'テクニック', sort_order: 2, children: [] },
  { id: 3, parent_id: null, name: 'アセット', sort_order: 3, children: [] },
  { id: 4, parent_id: null, name: '装備セット', sort_order: 4, children: [] },
]

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: 1,
  category: { id: 11, parent_id: 1, name: '頭(防)', sort_order: 1 },
  name: 'アイテム',
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

// コピー元アイテム（装備品・追加効果＋付加効果つき）
const sourceItem: Item = makeItem({
  id: 7,
  name: '炎の大兜',
  description: '炎耐性つきの兜',
  base_stats: { atk: 10 },
  dyeable: true,
  mithril: true,
  locked_by_staff: true,
  bonus_effects: [
    {
      id: 5,
      effect_name: '炎の加護',
      type: { id: 1, type_key: 'custom', label: 'カスタム', category: 'other' },
      values: [{ value: 15, value_unit: '%', label: '炎耐性' }],
      description: '炎耐性+15%',
    },
  ],
})

// コピー元の装備セット（構成部位つき）
const sourceSet: Item = makeItem({
  id: 8,
  category: { id: 4, parent_id: null, name: '装備セット', sort_order: 4 },
  name: '騎士セット',
  is_equipment_set: true,
  set_piece_category_ids: [11],
  set_members: [makeItem({ id: 101, name: '騎士セットの頭' })],
})

type Entry = string | { pathname: string; search: string; state: unknown }

function renderCopyPage(entry: Entry = '/admin/items/new?copy=7') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/admin/items/new" element={<AdminItemEditPage />} />
        <Route path="/admin/items" element={<div data-testid="list-page" />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = makeUser('editor')
  alertMock.mockResolvedValue(undefined)
  mockedCategories.mockResolvedValue({ data: categories })
  mockedGet.mockResolvedValue({ data: sourceItem })
})

describe('AdminItemEditPage コピーして編集', () => {
  it('?copy=<id> でコピー元の入力内容を複製した新規作成フォームを表示する', async () => {
    renderCopyPage()

    expect(await screen.findByRole('heading', { name: 'アイテムをコピーして追加' })).toBeInTheDocument()
    await waitFor(() => expect(mockedGet).toHaveBeenCalledWith(7))

    // 基本情報・効果がコピー元の値で埋まっている
    expect(await screen.findByDisplayValue('炎の大兜')).toBeInTheDocument()
    expect(screen.getByDisplayValue('炎耐性つきの兜')).toBeInTheDocument()
    expect(screen.getByDisplayValue('炎の加護')).toBeInTheDocument()
    // 確認状態は引き継がない（新規アイテムとして登録するため）
    expect(screen.queryByText('✓ 確認済み')).not.toBeInTheDocument()
  })

  it('保存すると新規アイテムとして登録する（create を呼び、update は呼ばない）', async () => {
    mockedCreate.mockResolvedValue({ data: { ...sourceItem, id: 99 } })
    renderCopyPage()
    await screen.findByDisplayValue('炎の大兜')

    // 名前を変えて保存
    const nameInput = screen.getByDisplayValue('炎の大兜')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, '水の大兜')
    await userEvent.click(screen.getByRole('button', { name: 'アイテムを追加' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1))
    expect(mockedUpdate).not.toHaveBeenCalled()
    expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({
      category_id: 11,
      name: '水の大兜',
      base_stats: { atk: 10 },
      mithril: true,
      bonus_effects: [expect.objectContaining({ effect_name: '炎の加護' })],
    }))

    // 保存後は一覧へ戻る
    expect(await screen.findByTestId('list-page')).toBeInTheDocument()
  })

  it('コピーダイアログの名前変更（置換・末尾追加）をアイテム名へ適用する', async () => {
    renderCopyPage({
      pathname: '/admin/items/new',
      search: '?copy=7',
      state: { copyRename: { replacements: [{ search: '炎', replace: '水' }], suffix: '+1' } },
    })

    expect(await screen.findByDisplayValue('水の大兜+1')).toBeInTheDocument()
  })

  it('装備セットのコピーでは各部位アイテム名にも名前変更を適用する', async () => {
    mockedGet.mockResolvedValue({ data: sourceSet })
    renderCopyPage({
      pathname: '/admin/items/new',
      search: '?copy=8',
      state: { copyRename: { replacements: [{ search: '騎士', replace: '女王' }], suffix: '(染色可)' } },
    })

    // セット名・部位アイテム名の両方に置換＋末尾追加が適用される
    expect(await screen.findByDisplayValue('女王セット(染色可)')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('女王セットの頭(染色可)')).toBeInTheDocument()
  })

  it('一般ユーザーはコピーを利用できず一覧へ戻される', async () => {
    auth.user = makeUser('user', 9)
    renderCopyPage()

    expect(await screen.findByTestId('list-page')).toBeInTheDocument()
    expect(alertMock).toHaveBeenCalledWith(
      'アイテムのコピーは編集者・管理者のみ利用できます。',
      { title: 'コピーできません' }
    )
    expect(mockedGet).not.toHaveBeenCalled()
  })
})
