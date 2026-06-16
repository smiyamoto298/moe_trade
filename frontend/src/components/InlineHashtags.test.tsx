import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InlineHashtags from './InlineHashtags'
import { itemsApi } from '../api/items'
import type { ItemHashtag } from '../types'

vi.mock('../api/items', () => ({
  itemsApi: { replaceHashtags: vi.fn() },
}))
const mockedReplace = vi.mocked(itemsApi.replaceHashtags)

const tags: ItemHashtag[] = [
  { id: 1, tag: '公式', is_fixed: true },
  { id: 2, tag: '和風', is_fixed: false },
]

describe('InlineHashtags', () => {
  beforeEach(() => vi.clearAllMocks())

  it('未登録かつ編集可なら #ハッシュタグ プレースホルダを出す', () => {
    render(<InlineHashtags itemId={1} hashtags={[]} editable />)
    expect(screen.getByText('#ハッシュタグ')).toBeInTheDocument()
  })

  it('未登録で編集不可なら何も出さない', () => {
    const { container } = render(<InlineHashtags itemId={1} hashtags={[]} editable={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('クリックで通常タグだけをテキスト編集し、保存で総入れ替えAPIを呼ぶ', async () => {
    mockedReplace.mockResolvedValue({ data: [{ id: 9, tag: '袴', is_fixed: false }] })
    const onSaved = vi.fn()
    render(<InlineHashtags itemId={42} hashtags={tags} editable onSaved={onSaved} />)

    // 表示チップをクリックして編集モードへ
    await userEvent.click(screen.getByText('#和風'))
    // テキストボックスには通常タグのみ（固定タグ「公式」は含めない）
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('#和風')

    await userEvent.clear(input)
    await userEvent.type(input, '#袴')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith(42, ['袴']))
    expect(onSaved).toHaveBeenCalledWith([{ id: 9, tag: '袴', is_fixed: false }])
  })
})
