import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import UpdateBanner from './UpdateBanner'

// vitest.config.ts の define により __BUILD_ID__ は 'test-build'。
// version.json が別のビルドIDを返せば「更新あり」となる。
function mockVersionResponse(build: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ build }) })
  )
}

function fireVisible() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('UpdateBanner', () => {
  it('更新が無ければ何も表示しない', async () => {
    mockVersionResponse('test-build')
    render(<UpdateBanner />)

    fireVisible()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())

    expect(screen.queryByRole('button', { name: '更新する' })).not.toBeInTheDocument()
  })

  it('新しいビルドが配信されていればバナーを表示する', async () => {
    mockVersionResponse('newer-build')
    render(<UpdateBanner />)

    fireVisible()

    expect(await screen.findByRole('button', { name: '更新する' })).toBeInTheDocument()
  })
})
