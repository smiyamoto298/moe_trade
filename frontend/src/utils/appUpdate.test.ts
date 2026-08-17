import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fetchLatestBuildId,
  isUpdateAvailable,
  startUpdateWatcher,
  VERSION_URL,
} from './appUpdate'

// version.json の取得を差し替えるためのヘルパ
function fakeFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch
}

/** visibilitychange を任意の状態で発火させる */
function fireVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('isUpdateAvailable', () => {
  it('ビルドIDが異なれば更新ありと判定する', () => {
    expect(isUpdateAvailable('a', 'b')).toBe(true)
  })

  it('同じビルドIDなら更新なし', () => {
    expect(isUpdateAvailable('a', 'a')).toBe(false)
  })

  it('現在のビルドIDが不明なら誤検知を避けて常に更新なし', () => {
    // 開発ビルドなど define が効かない環境
    expect(isUpdateAvailable(undefined, 'b')).toBe(false)
  })

  it('取得に失敗した(null)場合は更新なし', () => {
    expect(isUpdateAvailable('a', null)).toBe(false)
  })
})

describe('fetchLatestBuildId', () => {
  it('version.json を no-store で取得してビルドIDを返す', async () => {
    const f = fakeFetch({ build: '20260817120000' })

    await expect(fetchLatestBuildId(f)).resolves.toBe('20260817120000')
    expect(f).toHaveBeenCalledWith(VERSION_URL, { cache: 'no-store' })
  })

  it('HTTPエラーなら null', async () => {
    await expect(fetchLatestBuildId(fakeFetch({}, false))).resolves.toBeNull()
  })

  it('build が無い・空文字なら null', async () => {
    await expect(fetchLatestBuildId(fakeFetch({}))).resolves.toBeNull()
    await expect(fetchLatestBuildId(fakeFetch({ build: '' }))).resolves.toBeNull()
  })

  it('通信例外(オフライン)は null を返して呼び出し側に例外を投げない', async () => {
    const f = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch

    await expect(fetchLatestBuildId(f)).resolves.toBeNull()
  })
})

describe('startUpdateWatcher', () => {
  it('前面復帰(visibilitychange)でチェックし、更新があればコールバックする', async () => {
    const onUpdateAvailable = vi.fn()
    const stop = startUpdateWatcher({
      currentBuildId: 'old',
      onUpdateAvailable,
      fetchImpl: fakeFetch({ build: 'new' }),
    })

    fireVisibility('visible')
    await vi.waitFor(() => expect(onUpdateAvailable).toHaveBeenCalledTimes(1))

    stop()
  })

  it('同一ビルドならコールバックしない', async () => {
    const onUpdateAvailable = vi.fn()
    const f = fakeFetch({ build: 'same' })
    const stop = startUpdateWatcher({ currentBuildId: 'same', onUpdateAvailable, fetchImpl: f })

    fireVisibility('visible')
    await vi.waitFor(() => expect(f).toHaveBeenCalled())
    expect(onUpdateAvailable).not.toHaveBeenCalled()

    stop()
  })

  it('非表示になったときはチェックしない', async () => {
    const f = fakeFetch({ build: 'new' })
    const stop = startUpdateWatcher({ currentBuildId: 'old', onUpdateAvailable: vi.fn(), fetchImpl: f })

    fireVisibility('hidden')
    expect(f).not.toHaveBeenCalled()

    stop()
  })

  it('一度検知したら監視を止め、再通知しない', async () => {
    const onUpdateAvailable = vi.fn()
    startUpdateWatcher({
      currentBuildId: 'old',
      onUpdateAvailable,
      fetchImpl: fakeFetch({ build: 'new' }),
    })

    fireVisibility('visible')
    await vi.waitFor(() => expect(onUpdateAvailable).toHaveBeenCalledTimes(1))

    fireVisibility('hidden')
    fireVisibility('visible')
    await Promise.resolve()
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1)
  })

  it('ビルドIDが無い環境では監視を開始しない', () => {
    const f = fakeFetch({ build: 'new' })
    const stop = startUpdateWatcher({
      currentBuildId: undefined,
      onUpdateAvailable: vi.fn(),
      fetchImpl: f,
    })

    fireVisibility('visible')
    expect(f).not.toHaveBeenCalled()

    stop()
  })

  it('停止後はイベントを拾わない', async () => {
    const f = fakeFetch({ build: 'new' })
    const stop = startUpdateWatcher({ currentBuildId: 'old', onUpdateAvailable: vi.fn(), fetchImpl: f })

    stop()
    fireVisibility('visible')
    expect(f).not.toHaveBeenCalled()
  })

  it('定期チェックでも更新を検知する', async () => {
    vi.useFakeTimers()
    const onUpdateAvailable = vi.fn()
    startUpdateWatcher({
      currentBuildId: 'old',
      onUpdateAvailable,
      fetchImpl: fakeFetch({ build: 'new' }),
      intervalMs: 1000,
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1)
  })
})
