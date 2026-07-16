import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BoardPage from './BoardPage'

// design.md「9. お問い合わせ（掲示板）」: 表示名は「お問い合わせ」（旧称: 運営掲示板）。
// URL /board・APIパスは旧称のまま変更しない。

vi.mock('../api/board', () => ({
  boardApi: {
    listThreads: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    createThread: vi.fn(),
  },
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 10, email: 'hashed', role: 'user', is_suspended: false, characters: [] },
    loading: false,
    refresh: vi.fn(),
  }),
}))
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    markBoardSeen: vi.fn(),
    unreadBoardThreadIds: new Set<number>(),
  }),
}))

describe('BoardPage', () => {
  it('見出しは「お問い合わせ」を表示し、旧称「運営掲示板」は表示しない', async () => {
    const { getByText, queryByText } = render(
      <MemoryRouter>
        <BoardPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(getByText('お問い合わせ')).toBeTruthy()
    })
    expect(queryByText(/運営掲示板/)).toBeNull()
  })

  it('全員に見える旨の注意書きも新名称で表示する', async () => {
    const { getByText } = render(
      <MemoryRouter>
        <BoardPage />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(getByText(/お問い合わせの投稿内容は、ログイン中のすべてのユーザーが閲覧できます/)).toBeTruthy()
    })
  })
})
