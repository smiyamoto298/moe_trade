import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OwnedItemsPage from './OwnedItemsPage'
import { itemsApi } from '../api/items'
import { excludedItemsApi } from '../api/excludedItems'
import { saveInventory, loadInitialInventory, getDisplayType } from '../utils/inventoryStore'
import type { Item, InventoryData } from '../types'

// design.md「アイテムボックス > 貼り付け取り込み」:
// 一覧を表示するタイミングで、未紐づけ（itemId=null）の行を /api/items/match で
// 登録アイテムへ再照合し、一致したものを自動でリンクして保存する。
// 末尾「...」の省略名は誤紐づけ防止のため対象外。
// 未紐づけ行のボタン: 省略名（...）は「候補」のみ、完全名は「新規登録」のみを表示する。

vi.mock('../api/items', () => ({ itemsApi: { matchNames: vi.fn() } }))
vi.mock('../api/buyRequests', () => ({ buyRequestsApi: { prices: vi.fn(() => Promise.resolve({ data: {} })) } }))
vi.mock('../api/excludedItems', () => ({
  excludedItemsApi: { list: vi.fn(() => Promise.resolve({ data: { types: [], items: [] } })), report: vi.fn(() => Promise.resolve()), createType: vi.fn() },
  serverExcludedItemsApi: { list: vi.fn(() => Promise.resolve({ data: [] })) },
}))
vi.mock('../api/client', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: {} })) } }))
vi.mock('../utils/inventoryStore', () => ({
  getStorageMode: vi.fn(() => 'local'),
  loadInitialInventory: vi.fn(),
  saveInventory: vi.fn(() => Promise.resolve()),
  persistStorageMode: vi.fn(() => Promise.resolve()),
  // 既定で全種別表示にしてテストの行が見えるようにする（種別フィルタは別テストで検証）
  getDisplayType: vi.fn(() => 'all'),
  setDisplayType: vi.fn(),
  getServerExcludedNames: vi.fn(() => []),
  setServerExcludedNames: vi.fn(),
}))
vi.mock('../hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('../contexts/DialogContext', () => ({
  useDialog: () => ({ confirm: vi.fn(), alert: vi.fn(), prompt: vi.fn() }),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'user' } }),
}))
vi.mock('../components/NewItemForm', () => ({ default: () => <div /> }))
vi.mock('../components/CandidateSelectModal', () => ({ default: () => <div /> }))
vi.mock('../components/PriceAnalyticsModal', () => ({ default: () => <div /> }))
vi.mock('../components/equipmentCells', () => ({ BaseStatBadges: () => <div /> }))

const mockedMatch = vi.mocked(itemsApi.matchNames)
const mockedLoad = vi.mocked(loadInitialInventory)
const mockedSave = vi.mocked(saveInventory)
const mockedDisplayType = vi.mocked(getDisplayType)
const mockedExcludedList = vi.mocked(excludedItemsApi.list)

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: 12,
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
  note: '',
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

  it('紐づけ済みの行はスナップショット更新のため再照合するが、内容が同じなら保存しない', async () => {
    const item = makeItem()
    mockedLoad.mockResolvedValue({
      mode: 'local',
      data: makeInventory([unlinkedRow({ itemId: 12, item })]),
    })
    // 再照合で同一内容が返る（変化なし）
    mockedMatch.mockResolvedValue({ data: { '炎の大剣': makeItem() } })

    renderPage()

    // 登録アイテム名で再照合される
    await waitFor(() => expect(mockedMatch).toHaveBeenCalledWith(['炎の大剣']))
    // 内容が変わらないので保存（commit→saveInventory）は走らない
    await waitFor(() => expect(mockedLoad).toHaveBeenCalled())
    expect(mockedSave).not.toHaveBeenCalled()
  })
})

describe('OwnedItemsPage 表示切替タブ', () => {
  beforeEach(() => vi.clearAllMocks())

  it('アカウントごとのタブで表示を絞り込める（セレクトボックスからタブ化）', async () => {
    const inv: InventoryData = {
      accounts: [{ id: 'acc1', name: 'メイン' }, { id: 'acc2', name: 'サブ' }],
      items: [
        unlinkedRow({ id: 'r1', accountId: 'acc1', name: 'アイテムA' }),
        unlinkedRow({ id: 'r2', accountId: 'acc2', name: 'アイテムB' }),
      ],
      exclusions: [],
    }
    mockedLoad.mockResolvedValue({ mode: 'local', data: inv })
    mockedMatch.mockResolvedValue({ data: {} })

    const { container } = renderPage()

    // 取り込み先のピルとアカウント名が重複するため、表示切替タブはフィルタバー内に限定して検証する
    await waitFor(() => expect(container.querySelector('[data-tour="owned-filter"]')).toBeTruthy())
    const filterBar = container.querySelector('[data-tour="owned-filter"]') as HTMLElement

    // 各アカウントのタブが描画され、初期は全件表示（「すべて」は表示・種別の両行にあるため件数のみ確認）
    expect(within(filterBar).getByRole('button', { name: /メイン/ })).toBeInTheDocument()
    expect(within(filterBar).getByRole('button', { name: /サブ/ })).toBeInTheDocument()
    expect(screen.getByText('アイテムA')).toBeInTheDocument()
    expect(screen.getByText('アイテムB')).toBeInTheDocument()

    // 「サブ」タブで acc2 のアイテムのみに絞り込む
    fireEvent.click(within(filterBar).getByRole('button', { name: /サブ/ }))
    expect(screen.queryByText('アイテムA')).not.toBeInTheDocument()
    expect(screen.getByText('アイテムB')).toBeInTheDocument()
  })

  it('既定の表示種別は「取引可能」で、未登録（未設定）の行は表示されない', async () => {
    // useState 初期化時の1回だけ 'tradeable' を返す（後続テストへ影響させない）
    mockedDisplayType.mockReturnValueOnce('tradeable')
    const inv = makeInventory([
      unlinkedRow({ id: 'r1', name: '未登録アイテム' }), // itemId=null → 未設定
      unlinkedRow({ id: 'r2', name: '炎の大剣', itemId: 12, item: makeItem() }), // 取引可能
    ])
    mockedLoad.mockResolvedValue({ mode: 'local', data: inv })
    mockedMatch.mockResolvedValue({ data: {} })

    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('[data-tour="owned-filter"]')).toBeTruthy())

    // 取引可能（登録済み）だけ表示。未設定の未登録行は既定では非表示
    expect(screen.getByText('炎の大剣')).toBeInTheDocument()
    expect(screen.queryByText('未登録アイテム')).not.toBeInTheDocument()

    // 「未登録」タブに切り替えると未分類の行が見える
    const filterBar = container.querySelector('[data-tour="owned-filter"]') as HTMLElement
    fireEvent.click(within(filterBar).getByRole('button', { name: /未登録/ }))
    expect(screen.getByText('未登録アイテム')).toBeInTheDocument()
  })
})

describe('OwnedItemsPage 重複を確認', () => {
  beforeEach(() => vi.clearAllMocks())

  it('異なる取り込み先で同名のアイテムを一覧表示する（取引可能以外も対象・種別「未登録」のみ対象外）', async () => {
    mockedDisplayType.mockReturnValue('all')
    const item = makeItem({ id: 12, name: '炎の大剣' })
    const inv: InventoryData = {
      accounts: [{ id: 'acc1', name: 'メイン' }, { id: 'acc2', name: 'サブ' }],
      items: [
        // ① 取引可能（登録アイテム）を両アカウントで所持 → 重複
        unlinkedRow({ id: 'r1', accountId: 'acc1', name: '炎の大剣', itemId: 12, item: item, count: 2 }),
        unlinkedRow({ id: 'r2', accountId: 'acc2', name: '炎の大剣', itemId: 12, item: item, count: 3 }),
        // ② 未紐づけだが種別割当あり（取引可能以外）を両アカウントで所持 → 重複（対象）
        unlinkedRow({ id: 'r3', accountId: 'acc1', name: '光の杖', itemId: null, item: null }),
        unlinkedRow({ id: 'r4', accountId: 'acc2', name: '光の杖', itemId: null, item: null }),
        // ③ 種別「未登録」（itemId=null かつ種別未割当）は対象外
        unlinkedRow({ id: 'r5', accountId: 'acc1', name: '謎の薬', itemId: null, item: null }),
        unlinkedRow({ id: 'r6', accountId: 'acc2', name: '謎の薬', itemId: null, item: null }),
      ],
      // '光の杖' にユーザー種別を割り当て（unset ではなくなる）
      exclusions: [{ name: '光の杖', exclusion_type_id: 5 }],
    }
    mockedLoad.mockResolvedValue({ mode: 'local', data: inv })
    mockedMatch.mockResolvedValue({ data: {} })

    renderPage()

    const dupBtn = await screen.findByRole('button', { name: /重複を確認/ })
    // バッジ件数は2（炎の大剣・光の杖。謎の薬は未登録で除外）
    expect(dupBtn).toHaveTextContent('重複を確認 (2)')
    fireEvent.click(dupBtn)

    const dialog = await screen.findByText('重複の確認')
    const modal = dialog.closest('div')!.parentElement as HTMLElement
    expect(within(modal).getByText('炎の大剣')).toBeInTheDocument()
    expect(within(modal).getByText('光の杖')).toBeInTheDocument()
    expect(within(modal).getAllByText(/メイン/).length).toBeGreaterThan(0)
    expect(within(modal).getAllByText(/サブ/).length).toBeGreaterThan(0)
    // 種別「未登録」の「謎の薬」は重複一覧に出ない
    expect(within(modal).queryByText('謎の薬')).not.toBeInTheDocument()
  })

  it('同名でも取り込み先が1つだけなら重複としない', async () => {
    mockedDisplayType.mockReturnValue('all')
    const item = makeItem({ id: 12, name: '炎の大剣' })
    const inv: InventoryData = {
      accounts: [{ id: 'acc1', name: 'メイン' }],
      items: [
        unlinkedRow({ id: 'r1', accountId: 'acc1', name: '炎の大剣', itemId: 12, item, worn: false }),
        unlinkedRow({ id: 'r2', accountId: 'acc1', name: '炎の大剣', itemId: 12, item, worn: true }),
      ],
      exclusions: [],
    }
    mockedLoad.mockResolvedValue({ mode: 'local', data: inv })
    mockedMatch.mockResolvedValue({ data: {} })

    renderPage()

    const dupBtn = await screen.findByRole('button', { name: /重複を確認/ })
    expect(dupBtn).toHaveTextContent('重複を確認 (0)')
  })
})

describe('OwnedItemsPage 種別の変更', () => {
  beforeEach(() => vi.clearAllMocks())

  // 取引可能（登録済み）以外の行は、種別バッジをクリックして種別選択ダイアログを開ける。
  // 共通割当の行も「共通」マーク付きでクリック可能（ユーザーが自分用に上書きできる）。
  it('未設定・共通割当の行は種別バッジがクリックでき、ダイアログを開ける', async () => {
    mockedDisplayType.mockReturnValue('all')
    // 共通の種別割当: 「光の杖」→ レア(id=5)。既定種別「その他」(id=1)。
    mockedExcludedList.mockResolvedValue({
      data: {
        types: [
          { id: 1, name: 'その他', is_default: true, default_enabled: true, sort_order: 0 },
          { id: 5, name: 'レア', is_default: false, default_enabled: true, sort_order: 1 },
        ],
        items: [{ name: '光の杖', type_id: 5 }],
      },
    })
    const inv = makeInventory([
      unlinkedRow({ id: 'r1', name: '光の杖', itemId: null, item: null }), // 共通割当（レア）
      unlinkedRow({ id: 'r2', name: '謎の薬', itemId: null, item: null }), // 未設定
    ])
    mockedLoad.mockResolvedValue({ mode: 'local', data: inv })
    mockedMatch.mockResolvedValue({ data: {} })

    renderPage()

    // 共通割当の行の種別バッジ（title で一意に特定。種別タブの「レア」と区別する）。
    // 種別名「レア」＋「共通」マークを表示し、クリックできる。
    const commonBtn = await screen.findByTitle('管理者の共通種別。クリックで自分用に変更できます')
    expect(commonBtn).toHaveTextContent('レア')
    expect(commonBtn).toHaveTextContent('共通')
    // 未設定の行の種別バッジは「未設定」と表示
    const unsetBtn = screen.getByTitle('このアイテムの種別を設定')
    expect(unsetBtn).toHaveTextContent('未設定')

    // クリックで種別選択ダイアログが開く（共通割当もユーザーが上書き変更できる）
    fireEvent.click(commonBtn)
    expect(await screen.findByText('種別を選択')).toBeInTheDocument()
  })

  // 共通登録済みと同じ種別を選んだら、個別設定は冗長なので作らず削除する（共通に従う）。
  it('共通と同じ種別を選ぶと個別設定は削除され共通表示に戻る', async () => {
    mockedDisplayType.mockReturnValue('all')
    mockedExcludedList.mockResolvedValue({
      data: {
        types: [
          { id: 1, name: 'その他', is_default: true, default_enabled: true, sort_order: 0 },
          { id: 5, name: 'レア', is_default: false, default_enabled: true, sort_order: 1 },
        ],
        items: [{ name: '光の杖', type_id: 5 }], // 共通: 光の杖 = レア
      },
    })
    // ユーザーは「光の杖」を共通(レア)と異なる「その他」へ上書き済み
    const inv: InventoryData = {
      accounts: [{ id: 'acc1', name: 'メイン' }],
      items: [unlinkedRow({ id: 'r1', name: '光の杖', itemId: null, item: null })],
      exclusions: [{ name: '光の杖', exclusion_type_id: 1 }],
    }
    mockedLoad.mockResolvedValue({ mode: 'local', data: inv })
    mockedMatch.mockResolvedValue({ data: {} })

    renderPage()

    // 初期はユーザー上書き（その他）。バッジ（title=種別を変更・解除）をクリックしてダイアログを開く
    const userBtn = await screen.findByTitle('種別を変更・解除')
    expect(userBtn).toHaveTextContent('その他')
    fireEvent.click(userBtn)

    // ダイアログ内で共通と同じ「レア」を選ぶ
    const dialog = (await screen.findByText('種別を選択')).closest('div')!.parentElement as HTMLElement
    fireEvent.click(within(dialog).getByRole('button', { name: 'レア' }))

    // 個別設定は削除され、共通(レア)に従う＝バッジが「共通」表示へ変わる
    expect(await screen.findByTitle('管理者の共通種別。クリックで自分用に変更できます')).toBeInTheDocument()
    // 保存内容にも個別設定（光の杖）は含まれない
    await waitFor(() => {
      const saved = mockedSave.mock.calls.at(-1)?.[1] as InventoryData
      expect(saved.exclusions.some((e) => e.name === '光の杖')).toBe(false)
    }, { timeout: 2500 })
  })

  // 登録アイテムに紐づく行（取引可能）でも種別バッジをクリックでき、
  // 種別を割り当てるとその種別が取引可能より優先して表示される。
  it('取引可能の行にも種別を設定でき、設定した種別が優先される', async () => {
    mockedDisplayType.mockReturnValue('all')
    mockedExcludedList.mockResolvedValue({
      data: {
        types: [
          { id: 1, name: 'その他', is_default: true, default_enabled: true, sort_order: 0 },
          { id: 5, name: 'レア', is_default: false, default_enabled: true, sort_order: 1 },
        ],
        items: [],
      },
    })
    const item = makeItem({ id: 12, name: '炎の大剣' })
    mockedLoad.mockResolvedValue({
      mode: 'local',
      data: makeInventory([unlinkedRow({ id: 'r1', name: '炎の大剣', itemId: 12, item })]),
    })
    // 再照合は一致なし（スナップショット据え置き）。モック実装は clearAllMocks で消えず
    // 後続テストへ漏れるため、行内容を書き換えない値にしておく。
    mockedMatch.mockResolvedValue({ data: {} })

    renderPage()

    // 取引可能バッジがクリック可能（ボタン）で、押すと種別選択ダイアログが開く
    const tradeableBtn = await screen.findByTitle('登録アイテムの既定種別（取引可能）。クリックで種別を設定でき、設定した種別が優先されます')
    expect(tradeableBtn).toHaveTextContent('取引可能')
    fireEvent.click(tradeableBtn)

    const dialog = (await screen.findByText('種別を選択')).closest('div')!.parentElement as HTMLElement
    fireEvent.click(within(dialog).getByRole('button', { name: 'レア' }))

    // 割り当てた種別（レア）が取引可能より優先して表示される（ユーザー割当バッジへ変わる）
    const userBtn = await screen.findByTitle('種別を変更・解除')
    expect(userBtn).toHaveTextContent('レア')

    // ダイアログから解除すると取引可能に戻る
    fireEvent.click(userBtn)
    const dialog2 = (await screen.findByText('種別を選択')).closest('div')!.parentElement as HTMLElement
    fireEvent.click(within(dialog2).getByText('種別を解除'))
    expect(await screen.findByTitle('登録アイテムの既定種別（取引可能）。クリックで種別を設定でき、設定した種別が優先されます')).toBeInTheDocument()
  })
})

describe('OwnedItemsPage 公式DBリンク', () => {
  beforeEach(() => vi.clearAllMocks())

  // design.md「公式DB（公式サイトリンク）」: 登録アイテムに紐づく行のアイテム名欄に
  // OfficialDbLink（📖 公式DB）を表示する。official_url 未設定なら表示しない。
  it('official_url を持つ紐づけ済み行に公式DBリンクを表示する', async () => {
    mockedDisplayType.mockReturnValue('all')
    const linked = makeItem({ id: 12, name: '炎の大剣', official_url: 'https://moepic.com/item/12' })
    mockedLoad.mockResolvedValue({
      mode: 'local',
      data: makeInventory([unlinkedRow({ itemId: 12, item: linked })]),
    })

    renderPage()

    const link = await screen.findByTitle('公式サイトのアイテムページを新しいウィンドウで開く')
    expect(link).toBeInTheDocument()
  })

  it('紐づけ済み行の古いスナップショットを再照合で更新し、後付けの official_url を反映する', async () => {
    mockedDisplayType.mockReturnValue('all')
    // ローカル保存された item は official_url を持たない古いスナップショット
    const stale = makeItem({ id: 12, name: '炎の大剣', official_url: null })
    mockedLoad.mockResolvedValue({
      mode: 'local',
      data: makeInventory([unlinkedRow({ itemId: 12, item: stale })]),
    })
    // 再照合では official_url を持つ最新のアイテムが返る
    mockedMatch.mockResolvedValue({ data: { '炎の大剣': makeItem({ id: 12, name: '炎の大剣', official_url: 'https://moepic.com/item/12' }) } })

    renderPage()

    // 紐づけ済み行も登録アイテム名で再照合される
    await waitFor(() => expect(mockedMatch).toHaveBeenCalledWith(['炎の大剣']))
    // 更新後は公式DBリンクが表示される
    expect(await screen.findByTitle('公式サイトのアイテムページを新しいウィンドウで開く')).toBeInTheDocument()
  })

  it('official_url が無い行には公式DBリンクを表示しない', async () => {
    mockedDisplayType.mockReturnValue('all')
    const linked = makeItem({ id: 12, name: '炎の大剣', official_url: null })
    mockedLoad.mockResolvedValue({
      mode: 'local',
      data: makeInventory([unlinkedRow({ itemId: 12, item: linked })]),
    })
    // 再照合でも official_url は付かない（据え置き）
    mockedMatch.mockResolvedValue({ data: { '炎の大剣': makeItem({ id: 12, name: '炎の大剣', official_url: null }) } })

    renderPage()

    await waitFor(() => expect(screen.getByText('炎の大剣')).toBeInTheDocument())
    expect(screen.queryByTitle('公式サイトのアイテムページを新しいウィンドウで開く')).not.toBeInTheDocument()
  })
})

describe('OwnedItemsPage 未紐づけ行のボタン表示', () => {
  beforeEach(() => vi.clearAllMocks())

  it('末尾「...」の省略名は「候補」のみを表示し、新規登録ボタンは出さない', async () => {
    mockedLoad.mockResolvedValue({ mode: 'local', data: makeInventory([unlinkedRow({ name: '炎の大...' })]) })

    renderPage()

    await waitFor(() => expect(screen.getByText('候補')).toBeInTheDocument())
    expect(screen.queryByText('+ 新規登録')).not.toBeInTheDocument()
  })

  it('完全名の未紐づけ行は「新規登録」のみを表示し、候補ボタンは出さない', async () => {
    mockedLoad.mockResolvedValue({ mode: 'local', data: makeInventory([unlinkedRow({ name: '炎の大剣' })]) })
    // 再照合で一致させない（未紐づけのまま）
    mockedMatch.mockResolvedValue({ data: {} })

    renderPage()

    await waitFor(() => expect(screen.getByText('+ 新規登録')).toBeInTheDocument())
    expect(screen.queryByText('候補')).not.toBeInTheDocument()
  })
})
