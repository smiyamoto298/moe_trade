import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RegisterPage from './RegisterPage'
import { AuthProvider } from '../contexts/AuthContext'
import { authApi } from '../api/auth'
import type { User } from '../types'

// design.md「利用規約同意フロー」:
// - 登録画面マウント時に規約モーダルを自動表示し、同意するまで登録不可
// - 「同意する」でモーダルを閉じ、フォームが操作可能になる
// - 「同意しない」でトップページ（/）へ遷移する
// - 同意前は「登録する」ボタンを無効化

vi.mock('../api/auth', () => ({
  authApi: {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}))

// ツアーは別機能のためモック（規約同意後の自動開始はここでは対象外）
vi.mock('../tours/TourContext', () => ({
  useTour: () => ({ startTour: vi.fn() }),
  hasSeenTour: () => true,
}))

const mockedAuthApi = vi.mocked(authApi)

const user: User = {
  id: 1,
  email: 'hashed',
  role: 'user',
  is_suspended: false,
  email_verified_at: null,
  register_ip: null,
  characters: [],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auth/register']}>
      <AuthProvider>
        <Routes>
          <Route path="/auth/register" element={<RegisterPage />} />
          <Route path="/" element={<div>TOP_PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

const emailInput = () =>
  document.querySelector('input[type="email"]') as HTMLInputElement
const passwordInputs = () =>
  [...document.querySelectorAll('input[type="password"]')] as HTMLInputElement[]
const submitButton = () => screen.getByRole('button', { name: /登録する|登録中/ })
const agree = () => userEvent.click(screen.getByRole('button', { name: '同意する' }))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('RegisterPage（利用規約同意フロー）', () => {
  it('マウント時に規約モーダルを表示し、同意するまで「登録する」を無効化する', () => {
    renderPage()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })

  it('「同意する」でモーダルが閉じ、登録ボタンが有効になる', async () => {
    renderPage()
    await agree()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
  })

  it('「同意しない」でトップページへ遷移する', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '同意しない' }))
    expect(screen.getByText('TOP_PAGE')).toBeInTheDocument()
    expect(mockedAuthApi.register).not.toHaveBeenCalled()
  })

  it('パスワードが確認用と一致しない場合はエラーを表示し、送信しない', async () => {
    renderPage()
    await agree()
    await userEvent.type(emailInput(), 'user@example.com')
    const [pw, confirm] = passwordInputs()
    await userEvent.type(pw, 'password123')
    await userEvent.type(confirm, 'different456')
    await userEvent.click(submitButton())
    expect(screen.getByText('パスワードが一致しません')).toBeInTheDocument()
    expect(mockedAuthApi.register).not.toHaveBeenCalled()
  })

  it('登録成功でトークンを保存し、トップページへ遷移する（キャラクター付き）', async () => {
    mockedAuthApi.register.mockResolvedValue({
      data: { token: 'new-token', user },
    } as Awaited<ReturnType<typeof authApi.register>>)
    mockedAuthApi.me.mockResolvedValue({
      data: user,
    } as Awaited<ReturnType<typeof authApi.me>>)

    renderPage()
    await agree()
    await userEvent.type(emailInput(), 'user@example.com')
    const [pw, confirm] = passwordInputs()
    await userEvent.type(pw, 'password123')
    await userEvent.type(confirm, 'password123')
    // 1番目（Emerald）のキャラクター名を入力
    await userEvent.type(screen.getAllByPlaceholderText('キャラクター名')[0], 'Hero')
    await userEvent.click(submitButton())

    await waitFor(() => expect(screen.getByText('TOP_PAGE')).toBeInTheDocument())
    expect(mockedAuthApi.register).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
      password_confirmation: 'password123',
      characters: [{ server: 'Emerald', character_name: 'Hero', is_default: false }],
    })
    expect(localStorage.getItem('auth_token')).toBe('new-token')
  })

  it('登録APIがエラーを返した場合はメッセージを表示する', async () => {
    mockedAuthApi.register.mockRejectedValue({
      response: { data: { message: 'このメールアドレスは既に登録されています' } },
    })

    renderPage()
    await agree()
    await userEvent.type(emailInput(), 'dup@example.com')
    const [pw, confirm] = passwordInputs()
    await userEvent.type(pw, 'password123')
    await userEvent.type(confirm, 'password123')
    await userEvent.click(submitButton())

    expect(
      await screen.findByText('このメールアドレスは既に登録されています')
    ).toBeInTheDocument()
    expect(localStorage.getItem('auth_token')).toBeNull()
  })
})
