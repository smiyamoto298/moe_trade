import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminExcludedItemsPage from './AdminExcludedItemsPage'
import { excludedItemsApi, serverExcludedItemsApi } from '../../api/excludedItems'
import type { ExclusionType } from '../../types'

// design.md「アイテム種別管理」:
// 種別の改名はブラウザ標準の window.prompt ではなく、共通ダイアログ（useDialog().prompt）の
// テキストボックスで受け取る。ネイティブ prompt は環境により抑制され、改名ボタンが
// 無反応になる不具合があったため（他画面の入力ダイアログと同じ方式に統一）。

vi.mock('../../api/excludedItems', () => ({
  excludedItemsApi: {
    adminList: vi.fn(),
    userSuggestions: vi.fn(),
    dismissSuggestion: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeMany: vi.fn(),
    typeList: vi.fn(),
    createType: vi.fn(),
    updateType: vi.fn(),
    removeType: vi.fn(),
  },
  serverExcludedItemsApi: {
    adminList: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    removeMany: vi.fn(),
  },
}))

const { promptMock } = vi.hoisted(() => ({ promptMock: vi.fn() }))
vi.mock('../../contexts/DialogContext', () => ({
  useDialog: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    alert: vi.fn().mockResolvedValue(undefined),
    prompt: promptMock,
  }),
}))

const types: ExclusionType[] = [
  { id: 1, name: 'その他', is_default: true, default_enabled: true, sort_order: 0 },
  { id: 6, name: 'モンスタードロップ', is_default: false, default_enabled: true, sort_order: 5 },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(excludedItemsApi.adminList).mockResolvedValue({ data: [] })
  vi.mocked(excludedItemsApi.typeList).mockResolvedValue({ data: types })
  vi.mocked(excludedItemsApi.userSuggestions).mockResolvedValue({ data: [] })
  vi.mocked(serverExcludedItemsApi.adminList).mockResolvedValue({ data: [] })
})

// 種別名は種別チップのほか、追加フォーム等のセレクトの option にも表示されるため複数一致で待つ
const renderPage = async () => {
  render(<AdminExcludedItemsPage />)
  await waitFor(() => expect(screen.getAllByText(/モンスタードロップ/).length).toBeGreaterThan(0))
}

describe('AdminExcludedItemsPage 種別の改名', () => {
  it('改名ボタンで共通ダイアログの prompt を開き、決定で updateType を呼んで表示を更新する', async () => {
    promptMock.mockResolvedValue('ドロップアイテム')
    vi.mocked(excludedItemsApi.updateType).mockResolvedValue({
      data: { ...types[1], name: 'ドロップアイテム' },
    })
    // 標準 prompt へ退行していないことの監視（環境により抑制され無反応になるため使用禁止）
    const nativePrompt = vi.spyOn(window, 'prompt')

    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: '改名' }))

    expect(promptMock).toHaveBeenCalledWith('種別名', {
      title: '種別の改名',
      defaultValue: 'モンスタードロップ',
      confirmLabel: '決定',
    })
    await waitFor(() =>
      expect(excludedItemsApi.updateType).toHaveBeenCalledWith(6, { name: 'ドロップアイテム' }),
    )
    expect((await screen.findAllByText(/ドロップアイテム/)).length).toBeGreaterThan(0)
    expect(nativePrompt).not.toHaveBeenCalled()
  })

  it('キャンセル（null）や同名のときは updateType を呼ばない', async () => {
    await renderPage()

    promptMock.mockResolvedValue(null)
    await userEvent.click(screen.getByRole('button', { name: '改名' }))
    expect(excludedItemsApi.updateType).not.toHaveBeenCalled()

    promptMock.mockResolvedValue('モンスタードロップ')
    await userEvent.click(screen.getByRole('button', { name: '改名' }))
    expect(excludedItemsApi.updateType).not.toHaveBeenCalled()
  })

  it('既定種別「その他」には改名・削除ボタンを表示しない', async () => {
    await renderPage()
    // 非既定の「モンスタードロップ」の1つ分だけ表示される
    expect(screen.getAllByRole('button', { name: '改名' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(1)
  })
})
