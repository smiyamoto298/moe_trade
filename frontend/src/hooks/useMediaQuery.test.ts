import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from './useMediaQuery'

// design.md「レスポンシブ（アイテムボックス一覧）」: 一覧のテーブル⇔カード切替に使う
// メディアクエリ購読フック。matchMedia が使えない環境では fallback を返す。
describe('useMediaQuery', () => {
  afterEach(() => {
    // jsdom は matchMedia 未実装のため、テストで生やしたモックは毎回取り除く
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  it('matchMedia が無い環境では fallback を返す（既定 true）', () => {
    expect(renderHook(() => useMediaQuery('(min-width: 1024px)')).result.current).toBe(true)
    expect(renderHook(() => useMediaQuery('(min-width: 1024px)', false)).result.current).toBe(false)
  })

  it('matchMedia の一致状態を返し、change イベントに追従する', () => {
    let listener: (() => void) | null = null
    const mql = {
      matches: false,
      media: '(min-width: 1024px)',
      addEventListener: (_: string, cb: () => void) => { listener = cb },
      removeEventListener: vi.fn(),
    }
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia

    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)

    // ビューポートが広がった（クエリに一致した）ことを change イベントで通知
    act(() => {
      mql.matches = true
      listener?.()
    })
    expect(result.current).toBe(true)

    // アンマウントで購読を解除する
    unmount()
    expect(mql.removeEventListener).toHaveBeenCalled()
  })
})
