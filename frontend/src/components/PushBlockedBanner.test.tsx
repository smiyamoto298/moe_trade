import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PushBlockedBanner from './PushBlockedBanner'

// 通知の許可状態・PWA起動判定をテストごとに差し替える
const notif = {
  notifPermission: 'denied' as NotificationPermission,
  notifSupported: true,
  pushOptedOut: false,
}
const alertMock = vi.fn()
let standalone = true

vi.mock('../contexts/NotificationContext', () => ({ useNotification: () => notif }))
vi.mock('../contexts/DialogContext', () => ({ useDialog: () => ({ alert: alertMock }) }))
vi.mock('../utils/installPrompt', () => ({ isRunningStandalone: () => standalone }))

beforeEach(() => {
  notif.notifPermission = 'denied'
  notif.notifSupported = true
  notif.pushOptedOut = false
  standalone = true
  alertMock.mockClear()
})

const BANNER_TEXT = /通知がブロックされているため/

describe('PushBlockedBanner', () => {
  it('PWA起動かつ通知ブロック中なら警告を表示する', () => {
    render(<PushBlockedBanner />)

    expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '解除方法' })).toBeInTheDocument()
  })

  it('PWA起動でなければ表示しない', () => {
    standalone = false
    render(<PushBlockedBanner />)

    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('通知が許可済みなら表示しない', () => {
    notif.notifPermission = 'granted'
    render(<PushBlockedBanner />)

    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('未許可（default）の段階では表示しない', () => {
    notif.notifPermission = 'default'
    render(<PushBlockedBanner />)

    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('通知API非対応（notifPermission が denied 固定）では表示しない', () => {
    notif.notifSupported = false
    render(<PushBlockedBanner />)

    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('サイト側で通知をOFFにしている人には表示しない', () => {
    notif.pushOptedOut = true
    render(<PushBlockedBanner />)

    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('「解除方法」でブロック解除手順のダイアログを開く', () => {
    render(<PushBlockedBanner />)

    fireEvent.click(screen.getByRole('button', { name: '解除方法' }))

    expect(alertMock).toHaveBeenCalledTimes(1)
    expect(alertMock.mock.calls[0][1]).toMatchObject({ title: '通知ブロックの解除方法' })
  })

  it('✕で閉じられる（この起動中は再表示しない）', () => {
    render(<PushBlockedBanner />)

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })
})
