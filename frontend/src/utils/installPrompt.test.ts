import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  installPromptCapture,
  isInstallAvailable,
  isRunningStandalone,
  promptInstall,
  resetInstallPromptForTest,
  subscribeInstallAvailability,
  type BeforeInstallPromptEvent,
} from './installPrompt'

/** Chrome が投げる beforeinstallprompt を模したイベントを作る */
function makeBeforeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent
  event.prompt = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(event, 'userChoice', {
    value: Promise.resolve({ outcome, platform: 'web' }),
    configurable: true,
  })
  return event
}

/** matchMedia は jsdom に無いため差し替える */
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

describe('installPromptCapture', () => {
  it('待ち受け前はインストール不可', () => {
    expect(isInstallAvailable()).toBe(false)
  })

  it('beforeinstallprompt を受け取るとインストール可能になり購読者へ通知する', () => {
    const listener = vi.fn()
    installPromptCapture()
    subscribeInstallAvailability(listener)

    window.dispatchEvent(makeBeforeInstallPromptEvent())

    expect(isInstallAvailable()).toBe(true)
    expect(listener).toHaveBeenCalledWith(true)
  })

  it('Chrome 既定のミニバーを抑止する（preventDefault を呼ぶ）', () => {
    installPromptCapture()
    const event = makeBeforeInstallPromptEvent()
    const preventDefault = vi.spyOn(event, 'preventDefault')

    window.dispatchEvent(event)

    expect(preventDefault).toHaveBeenCalled()
  })

  it('appinstalled でインストール不可に戻る', () => {
    const listener = vi.fn()
    installPromptCapture()
    subscribeInstallAvailability(listener)
    window.dispatchEvent(makeBeforeInstallPromptEvent())

    window.dispatchEvent(new Event('appinstalled'))

    expect(isInstallAvailable()).toBe(false)
    expect(listener).toHaveBeenLastCalledWith(false)
  })

  it('購読解除後は通知されない', () => {
    const listener = vi.fn()
    installPromptCapture()
    const unsubscribe = subscribeInstallAvailability(listener)
    unsubscribe()

    window.dispatchEvent(makeBeforeInstallPromptEvent())

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('promptInstall', () => {
  it('保持したイベントの prompt を呼び、承諾なら true', async () => {
    installPromptCapture()
    const event = makeBeforeInstallPromptEvent('accepted')
    window.dispatchEvent(event)

    await expect(promptInstall()).resolves.toBe(true)
    expect(event.prompt).toHaveBeenCalled()
  })

  it('拒否されたら false', async () => {
    installPromptCapture()
    window.dispatchEvent(makeBeforeInstallPromptEvent('dismissed'))

    await expect(promptInstall()).resolves.toBe(false)
  })

  it('prompt は使い切りで、2回目は false になる', async () => {
    installPromptCapture()
    window.dispatchEvent(makeBeforeInstallPromptEvent('accepted'))

    await promptInstall()

    expect(isInstallAvailable()).toBe(false)
    await expect(promptInstall()).resolves.toBe(false)
  })

  it('イベント未保持なら何もせず false', async () => {
    await expect(promptInstall()).resolves.toBe(false)
  })

  it('prompt が例外を投げても false を返す', async () => {
    installPromptCapture()
    const event = makeBeforeInstallPromptEvent()
    event.prompt = vi.fn().mockRejectedValue(new Error('failed'))
    window.dispatchEvent(event)

    await expect(promptInstall()).resolves.toBe(false)
  })
})

describe('isRunningStandalone', () => {
  it('display-mode: standalone なら true', () => {
    mockMatchMedia(true)
    expect(isRunningStandalone()).toBe(true)
  })

  it('ブラウザタブなら false', () => {
    mockMatchMedia(false)
    expect(isRunningStandalone()).toBe(false)
  })

  it('iOS Safari の navigator.standalone でも判定する', () => {
    mockMatchMedia(false)
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })

    expect(isRunningStandalone()).toBe(true)

    Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true })
  })
})
