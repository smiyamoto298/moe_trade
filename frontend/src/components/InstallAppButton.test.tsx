import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InstallAppButton from './InstallAppButton'
import {
  installPromptCapture,
  resetInstallPromptForTest,
  type BeforeInstallPromptEvent,
} from '../utils/installPrompt'

function makeBeforeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent
  event.prompt = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(event, 'userChoice', {
    value: Promise.resolve({ outcome, platform: 'web' }),
    configurable: true,
  })
  return event
}

function mockMatchMedia(standalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: standalone && query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
}

beforeEach(() => {
  resetInstallPromptForTest()
  mockMatchMedia(false)
})

afterEach(() => {
  resetInstallPromptForTest()
})

describe('InstallAppButton', () => {
  it('インストール可能になるまで何も表示しない', () => {
    render(<InstallAppButton />)

    expect(screen.queryByRole('button', { name: 'インストール' })).not.toBeInTheDocument()
  })

  it('beforeinstallprompt を受け取るとバナーが出る', async () => {
    installPromptCapture()
    render(<InstallAppButton />)

    window.dispatchEvent(makeBeforeInstallPromptEvent())

    expect(await screen.findByRole('button', { name: 'インストール' })).toBeInTheDocument()
  })

  it('インストールを押すと prompt が呼ばれ、承諾後はバナーが消える', async () => {
    installPromptCapture()
    const event = makeBeforeInstallPromptEvent('accepted')
    render(<InstallAppButton />)
    window.dispatchEvent(event)

    await userEvent.click(await screen.findByRole('button', { name: 'インストール' }))

    expect(event.prompt).toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'インストール' })).not.toBeInTheDocument()
    )
  })

  it('「あとで」を押すと非表示になり、次回以降も出さない（localStorage 永続）', async () => {
    installPromptCapture()
    render(<InstallAppButton />)
    window.dispatchEvent(makeBeforeInstallPromptEvent())

    await userEvent.click(await screen.findByRole('button', { name: 'あとで' }))

    expect(screen.queryByRole('button', { name: 'インストール' })).not.toBeInTheDocument()
    expect(localStorage.getItem('pwa_install_dismissed')).toBe('1')
  })

  it('「あとで」済みの端末では表示しない', () => {
    localStorage.setItem('pwa_install_dismissed', '1')
    installPromptCapture()
    render(<InstallAppButton />)

    window.dispatchEvent(makeBeforeInstallPromptEvent())

    expect(screen.queryByRole('button', { name: 'インストール' })).not.toBeInTheDocument()
  })

  it('インストール済み（standalone 起動）では表示しない', () => {
    mockMatchMedia(true)
    installPromptCapture()
    render(<InstallAppButton />)

    window.dispatchEvent(makeBeforeInstallPromptEvent())

    expect(screen.queryByRole('button', { name: 'インストール' })).not.toBeInTheDocument()
  })
})
