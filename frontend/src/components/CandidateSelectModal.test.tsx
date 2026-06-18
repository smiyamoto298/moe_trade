import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CandidateSelectModal from './CandidateSelectModal'
import { itemsApi } from '../api/items'
import type { Item } from '../types'

// マイペ整理: 省略名の候補ダイアログでは、前方一致候補の有無に関わらず
// 新規登録へ進めるボタンを常に表示する（検索キーワードを引き継ぐ）。

vi.mock('../api/items', () => ({ itemsApi: { list: vi.fn() } }))

const mockedList = vi.mocked(itemsApi.list)

// 表示に必要な最小フィールドのみ（コンポーネントは id/name/category.name/verified_status を参照）
const makeItem = (name: string): Item => ({
  id: 1,
  name,
  category: { id: 1, parent_id: null, name: '刀剣', sort_order: 1 },
  verified_status: 'verified',
} as unknown as Item)

describe('CandidateSelectModal 新規登録への導線', () => {
  beforeEach(() => vi.clearAllMocks())

  it('候補が無いとき onRegisterNew ボタンを表示し、検索キーワードを渡して呼ぶ', async () => {
    mockedList.mockResolvedValue({ data: [] })
    const onRegisterNew = vi.fn()

    render(
      <CandidateSelectModal
        baseName="炎の大"
        originalName="炎の大..."
        onSelect={vi.fn()}
        onRegisterNew={onRegisterNew}
        onCancel={vi.fn()}
      />
    )

    const registerBtn = await screen.findByText('+ このアイテムを新規登録する')
    fireEvent.click(registerBtn)
    expect(onRegisterNew).toHaveBeenCalledWith('炎の大')
  })

  it('前方一致候補が見つかっても新規登録ボタンを表示する', async () => {
    mockedList.mockResolvedValue({ data: [makeItem('炎の大剣'), makeItem('炎の大盾')] })
    const onRegisterNew = vi.fn()

    render(
      <CandidateSelectModal
        baseName="炎の大"
        originalName="炎の大..."
        onSelect={vi.fn()}
        onRegisterNew={onRegisterNew}
        onCancel={vi.fn()}
      />
    )

    // 候補が表示されている
    await waitFor(() => expect(screen.getByText('炎の大剣')).toBeInTheDocument())
    // 候補があっても新規登録ボタンは出る
    const registerBtn = screen.getByText('+ このアイテムを新規登録する')
    fireEvent.click(registerBtn)
    expect(onRegisterNew).toHaveBeenCalledWith('炎の大')
  })

  it('onRegisterNew 未指定なら新規登録ボタンは出さない', async () => {
    mockedList.mockResolvedValue({ data: [] })

    render(
      <CandidateSelectModal
        baseName="炎の大"
        originalName="炎の大..."
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await waitFor(() => expect(screen.getByText('前方一致する既存アイテムが見つかりませんでした。')).toBeInTheDocument())
    expect(screen.queryByText('+ このアイテムを新規登録する')).not.toBeInTheDocument()
  })
})
