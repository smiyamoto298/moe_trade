import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import NotificationSettingsPage from './NotificationSettingsPage'
import { notificationSettingsApi, type NotificationSettings } from '../api/notificationSettings'

// design.md §8「通知設定」:
// - 種別（取引/オークション/期限切れ）× チャネル（ブラウザ通知/メール）を個別に ON/OFF
// - トグル操作で即座に保存し、失敗したら元の状態へ戻す
// - 通知先メールが未設定/未確認のときは「ONにしても届かない」旨を明示する
// - ログイン用と別のアドレスを指定すると確認メールを送り、確認まで通知は届かない

vi.mock('../api/notificationSettings', async () => {
  const actual = await vi.importActual<typeof import('../api/notificationSettings')>(
    '../api/notificationSettings'
  )
  return {
    ...actual,
    notificationSettingsApi: {
      get: vi.fn(),
      update: vi.fn(),
      setEmail: vi.fn(),
      clearEmail: vi.fn(),
    },
  }
})

// ブラウザ通知の許可状態・購読操作（既定は許可済み・OFFにしていない状態）。
// テストごとに notifState を書き換えて各状態を再現する。
const notifState = vi.hoisted(() => ({
  permission: 'granted' as NotificationPermission,
  supported: true,
  optedOut: false,
  disablePush: vi.fn(),
  enablePush: vi.fn(),
  requestNotifPermission: vi.fn(),
}))
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    notifPermission: notifState.permission,
    notifSupported: notifState.supported,
    pushEnabled: true,
    pushOptedOut: notifState.optedOut,
    disablePush: notifState.disablePush,
    enablePush: notifState.enablePush,
    requestNotifPermission: notifState.requestNotifPermission,
  }),
}))

const dialogMocks = vi.hoisted(() => ({
  alert: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true),
}))
vi.mock('../contexts/DialogContext', () => ({
  useDialog: () => dialogMocks,
}))

const mockedApi = vi.mocked(notificationSettingsApi)

const settings = (overrides: Partial<NotificationSettings> = {}): NotificationSettings => ({
  notification_email: null,
  notification_email_verified: false,
  notification_email_status: 'none',
  is_login_email: false,
  push: { trade: true, auction: true, expiry: true },
  email: { trade: true, auction: true, expiry: true },
  ...overrides,
})

// axios レスポンスのうちテストで使うのは data だけなので、最小の形で差し替える
const ok = <T,>(data: T) =>
  ({ data }) as unknown as Awaited<ReturnType<typeof notificationSettingsApi.get>>

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/mypage/notifications']}>
      <Routes>
        <Route path="/mypage/notifications" element={<NotificationSettingsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  notifState.permission = 'granted'
  notifState.supported = true
  notifState.optedOut = false
  dialogMocks.confirm.mockResolvedValue(true)
})

describe('NotificationSettingsPage', () => {
  it('種別ごとにブラウザ通知とメール通知のトグルを表示する', async () => {
    mockedApi.get.mockResolvedValue(ok(settings()))
    renderPage()

    await screen.findByRole('checkbox', { name: '取引のブラウザ通知' })
    for (const label of ['取引', 'オークション', '期限切れ']) {
      expect(screen.getByRole('checkbox', { name: `${label}のブラウザ通知` })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: `${label}のメール通知` })).toBeChecked()
    }
  })

  it('トグルを切り替えると両チャネルの設定を送信して保存する', async () => {
    mockedApi.get.mockResolvedValue(ok(settings()))
    mockedApi.update.mockResolvedValue(
      ok(settings({ push: { trade: true, auction: false, expiry: true } })) as never
    )
    renderPage()

    await userEvent.click(await screen.findByRole('checkbox', { name: 'オークションのブラウザ通知' }))

    await waitFor(() => expect(mockedApi.update).toHaveBeenCalledWith({
      push: { trade: true, auction: false, expiry: true },
      email: { trade: true, auction: true, expiry: true },
    }))
  })

  it('保存に失敗したらトグルを元に戻してエラーを表示する', async () => {
    mockedApi.get.mockResolvedValue(ok(settings()))
    mockedApi.update.mockRejectedValue(new Error('boom'))
    renderPage()

    const toggle = await screen.findByRole('checkbox', { name: '取引のメール通知' })
    await userEvent.click(toggle)

    await screen.findByText(/設定を保存できませんでした/)
    expect(screen.getByRole('checkbox', { name: '取引のメール通知' })).toBeChecked()
  })

  it('通知先メールが未設定ならメール通知が届かないことを案内する', async () => {
    mockedApi.get.mockResolvedValue(ok(settings()))
    renderPage()

    expect(await screen.findByText(/未設定のため、メール通知はONにしても届きません/)).toBeInTheDocument()
    expect(screen.getByText(/未設定（メール通知は届きません）/)).toBeInTheDocument()
  })

  it('ログイン用と別のアドレスを保存すると確認メールの案内を表示する', async () => {
    mockedApi.get.mockResolvedValue(ok(settings()))
    mockedApi.setEmail.mockResolvedValue(
      ok(settings({
        notification_email: 'notify@example.com',
        notification_email_status: 'pending_confirmation',
      })) as never
    )
    renderPage()

    const input = await screen.findByPlaceholderText('notify@example.com')
    await userEvent.type(input, 'notify@example.com')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mockedApi.setEmail).toHaveBeenCalledWith('notify@example.com'))
    expect(await screen.findByText(/確認メールを送信しました/)).toBeInTheDocument()
  })

  // 以下はマイページのヘッダー行から移設した「このブラウザの通知許可・購読」の操作
  it('通知ON中は配信中の表示と「OFFにする」を出し、押すと購読を解除する', async () => {
    mockedApi.get.mockResolvedValue(ok(settings()))
    renderPage()

    expect(await screen.findByText(/🔔 ON（プッシュ配信中）/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'OFFにする' }))
    expect(notifState.disablePush).toHaveBeenCalled()
  })

  it('通知OFF中は「ONに戻す」を出し、押すと再購読する', async () => {
    notifState.optedOut = true
    mockedApi.get.mockResolvedValue(ok(settings()))
    renderPage()

    expect(await screen.findByText(/OFFにしているため、ONにしても届きません/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ONに戻す' }))
    expect(notifState.enablePush).toHaveBeenCalled()
  })

  it('未許可なら「ブラウザ通知を有効にする」を出し、押すと許可を求める', async () => {
    notifState.permission = 'default'
    mockedApi.get.mockResolvedValue(ok(settings()))
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /ブラウザ通知を有効にする/ }))
    expect(notifState.requestNotifPermission).toHaveBeenCalled()
  })

  it('ブロック時は解除方法を、通知API非対応なら利用手順をダイアログで案内する', async () => {
    notifState.permission = 'denied'
    mockedApi.get.mockResolvedValue(ok(settings()))
    const { unmount } = renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '解除方法' }))
    expect(dialogMocks.alert).toHaveBeenCalledWith(
      expect.stringContaining('ブロックされています'),
      expect.objectContaining({ title: '通知ブロックの解除方法' })
    )

    unmount()
    notifState.supported = false
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '利用するには' }))
    expect(dialogMocks.alert).toHaveBeenCalledWith(
      expect.stringContaining('対応していません'),
      expect.objectContaining({ title: 'プッシュ通知を利用するには' })
    )
  })

  it('確認済みなら確認済みの表示になり、削除できる', async () => {
    mockedApi.get.mockResolvedValue(
      ok(settings({
        notification_email: 'notify@example.com',
        notification_email_verified: true,
        notification_email_status: 'verified',
      }))
    )
    mockedApi.clearEmail.mockResolvedValue(ok(settings()) as never)
    renderPage()

    expect(await screen.findByText(/✓ 確認済み/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    await waitFor(() => expect(mockedApi.clearEmail).toHaveBeenCalled())
    expect(await screen.findByText(/通知先メールアドレスを削除しました/)).toBeInTheDocument()
  })
})
