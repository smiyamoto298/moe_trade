import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BonusValueLabelsAdminPage from './BonusValueLabelsAdminPage'
import { bonusValueLabelsApi, type BonusValueLabel } from '../../api/bonusValueLabels'

// design.md「項目名候補マスタ」:
// 「付加効果の項目名(bonus)」「追加効果の項目名(stat)」をタブで切り替えて管理する。
// 各タブは整理済み(左)／未整理(右)の2ペインで管理。右→左へドラッグして任意位置へ整理する。
// 手動追加は未整理(右)に入る。公開候補は整理済み→未整理の順。

vi.mock('../../api/bonusValueLabels', () => ({
  bonusValueLabelsApi: {
    adminList: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    organize: vi.fn(),
    merge: vi.fn(),
  },
}))

vi.mock('../../contexts/DialogContext', () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}))

const mockedAdminList = vi.mocked(bonusValueLabelsApi.adminList)
const mockedCreate = vi.mocked(bonusValueLabelsApi.create)
const mockedOrganize = vi.mocked(bonusValueLabelsApi.organize)
const mockedMerge = vi.mocked(bonusValueLabelsApi.merge)

const labels: BonusValueLabel[] = [
  { id: 1, kind: 'bonus', label: '攻撃力', is_organized: true, sort_order: 0 },
  { id: 2, kind: 'bonus', label: '防御力', is_organized: true, sort_order: 1 },
  { id: 3, kind: 'bonus', label: '魔力', is_organized: false, sort_order: 0 },
  { id: 4, kind: 'bonus', label: '回避', is_organized: false, sort_order: 0 },
]

const statLabels: BonusValueLabel[] = [
  { id: 11, kind: 'stat', label: '釣り', is_organized: false, sort_order: 0 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockedAdminList.mockImplementation((kind = 'bonus') =>
    Promise.resolve({ data: kind === 'stat' ? statLabels : labels }),
  )
  mockedOrganize.mockResolvedValue({ data: null } as never)
})

const organizedZone = () => screen.getByTestId('organized-dropzone')
const unorganizedZone = () => screen.getByTestId('unorganized-dropzone')

describe('BonusValueLabelsAdminPage 2ペイン管理', () => {
  it('整理済みは左・未整理は右に振り分けて表示する', async () => {
    render(<BonusValueLabelsAdminPage />)
    await waitFor(() => expect(screen.getByDisplayValue('攻撃力')).toBeInTheDocument())

    expect(within(organizedZone()).getByDisplayValue('攻撃力')).toBeInTheDocument()
    expect(within(organizedZone()).getByDisplayValue('防御力')).toBeInTheDocument()
    expect(within(unorganizedZone()).getByDisplayValue('魔力')).toBeInTheDocument()
    expect(within(unorganizedZone()).getByDisplayValue('回避')).toBeInTheDocument()

    // 見出しの件数
    expect(screen.getByText('整理済み').parentElement).toHaveTextContent('(2)')
    expect(screen.getByText('未整理').parentElement).toHaveTextContent('(2)')
  })

  it('手動追加した項目は未整理(右)に入る', async () => {
    mockedCreate.mockResolvedValue({
      data: { id: 5, kind: 'bonus', label: '命中', is_organized: false, sort_order: 0 },
    } as never)

    render(<BonusValueLabelsAdminPage />)
    await waitFor(() => expect(screen.getByDisplayValue('攻撃力')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText(/例: 攻撃力/), '命中')
    await userEvent.click(screen.getByRole('button', { name: '+ 追加' }))

    await waitFor(() =>
      expect(within(unorganizedZone()).getByDisplayValue('命中')).toBeInTheDocument(),
    )
    expect(mockedCreate).toHaveBeenCalledWith('命中', 'bonus')
  })

  it('未整理の項目を整理済みへドロップすると organize が呼ばれ左へ移る', async () => {
    render(<BonusValueLabelsAdminPage />)
    await waitFor(() => expect(screen.getByDisplayValue('攻撃力')).toBeInTheDocument())

    // 魔力(id=3) のハンドルをドラッグ → 整理済みゾーンへドロップ（末尾に挿入）
    const card = within(unorganizedZone()).getByDisplayValue('魔力').closest('div')!
    fireEvent.dragStart(within(card).getByTitle('ドラッグして移動'))
    fireEvent.dragOver(organizedZone())
    fireEvent.drop(organizedZone())

    // 既存の整理済み 2 件の末尾に追加された並びで保存される（表示中の bonus タブが対象）
    expect(mockedOrganize).toHaveBeenCalledWith([1, 2, 3], 'bonus')
    await waitFor(() =>
      expect(within(organizedZone()).getByDisplayValue('魔力')).toBeInTheDocument(),
    )
  })

  it('整理済みの項目を未整理へドロップすると整理済みから外して保存する', async () => {
    render(<BonusValueLabelsAdminPage />)
    await waitFor(() => expect(screen.getByDisplayValue('攻撃力')).toBeInTheDocument())

    const card = within(organizedZone()).getByDisplayValue('防御力').closest('div')!
    fireEvent.dragStart(within(card).getByTitle('ドラッグして移動'))
    fireEvent.dragOver(unorganizedZone())
    fireEvent.drop(unorganizedZone())

    expect(mockedOrganize).toHaveBeenCalledWith([1], 'bonus')
    await waitFor(() =>
      expect(within(unorganizedZone()).getByDisplayValue('防御力')).toBeInTheDocument(),
    )
  })

  it('タブで「追加効果の項目名」(stat) に切り替えて表示・追加できる', async () => {
    render(<BonusValueLabelsAdminPage />)
    await waitFor(() => expect(screen.getByDisplayValue('攻撃力')).toBeInTheDocument())

    // 既定は付加効果(bonus)タブ
    expect(mockedAdminList).toHaveBeenCalledWith('bonus')

    await userEvent.click(screen.getByRole('tab', { name: '追加効果の項目名' }))

    // stat の一覧を読み込み、bonus の内容は表示されない
    await waitFor(() => expect(mockedAdminList).toHaveBeenCalledWith('stat'))
    await waitFor(() =>
      expect(within(unorganizedZone()).getByDisplayValue('釣り')).toBeInTheDocument(),
    )
    expect(screen.queryByDisplayValue('攻撃力')).not.toBeInTheDocument()

    // stat タブでの手動追加は kind='stat' で登録される
    mockedCreate.mockResolvedValue({
      data: { id: 12, kind: 'stat', label: '採掘', is_organized: false, sort_order: 0 },
    } as never)
    await userEvent.type(screen.getByPlaceholderText(/例: 攻撃力/), '採掘')
    await userEvent.click(screen.getByRole('button', { name: '+ 追加' }))
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('採掘', 'stat'))
  })

  it('未整理の項目を整理済みの項目へ統合できる', async () => {
    mockedMerge.mockResolvedValue({
      data: { merged_into: { id: 1, label: '攻撃力' }, updated_count: 3 },
    } as never)

    render(<BonusValueLabelsAdminPage />)
    await waitFor(() => expect(screen.getByDisplayValue('攻撃力')).toBeInTheDocument())

    // 統合ボタンは未整理カードにだけ表示される（未整理2件分）
    expect(screen.getAllByRole('button', { name: '統合' })).toHaveLength(2)

    // 魔力(id=3) の統合を開く → 統合先モーダルに整理済み項目が並ぶ
    const card = within(unorganizedZone()).getByDisplayValue('魔力').closest('div')!
    await userEvent.click(within(card).getByRole('button', { name: '統合' }))
    const modal = await screen.findByTestId('merge-modal')

    // 統合先（攻撃力=id:1）を選択 → confirm(モック=true) → API 呼び出し
    await userEvent.click(within(modal).getByRole('button', { name: '攻撃力' }))
    await waitFor(() => expect(mockedMerge).toHaveBeenCalledWith(3, 1))

    // 統合元は未整理から消え、モーダルは閉じる
    await waitFor(() =>
      expect(within(unorganizedZone()).queryByDisplayValue('魔力')).not.toBeInTheDocument(),
    )
    expect(screen.queryByTestId('merge-modal')).not.toBeInTheDocument()
  })

  it('統合ボタンは整理済みカードには表示されない', async () => {
    render(<BonusValueLabelsAdminPage />)
    await waitFor(() => expect(screen.getByDisplayValue('攻撃力')).toBeInTheDocument())

    expect(within(organizedZone()).queryByRole('button', { name: '統合' })).not.toBeInTheDocument()
  })
})
