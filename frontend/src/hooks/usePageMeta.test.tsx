// usePageMeta — ページごとの <title> / meta description 設定（SEO）のテスト。
// 出品・買取の詳細ページでアイテム名がタイトルに入り、検索エンジンにヒットさせるための要。
import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { usePageMeta, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from './usePageMeta'

function Meta({ title, description }: { title?: string | null; description?: string | null }) {
  usePageMeta(title, description)
  return null
}

describe('usePageMeta', () => {
  beforeEach(() => {
    document.title = DEFAULT_TITLE
    document.head.querySelector('meta[name="description"]')?.remove()
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    meta.setAttribute('content', DEFAULT_DESCRIPTION)
    document.head.appendChild(meta)
  })

  const descriptionContent = () =>
    document.head.querySelector('meta[name="description"]')?.getAttribute('content')

  it('タイトルを「◯◯ | MoE Trade」形式で設定し、説明文も差し替える', () => {
    render(<Meta title="テストの剣 の出品" description="テストの剣の出品情報" />)

    expect(document.title).toBe('テストの剣 の出品 | MoE Trade')
    expect(descriptionContent()).toBe('テストの剣の出品情報')
  })

  it('タイトル未指定（データ読込中など）は既定値を維持する', () => {
    render(<Meta title={null} description={null} />)

    expect(document.title).toBe(DEFAULT_TITLE)
    expect(descriptionContent()).toBe(DEFAULT_DESCRIPTION)
  })

  it('アンマウント時に既定値へ戻す', () => {
    const { unmount } = render(<Meta title="テストの剣 の出品" description="説明" />)
    unmount()

    expect(document.title).toBe(DEFAULT_TITLE)
    expect(descriptionContent()).toBe(DEFAULT_DESCRIPTION)
  })

  it('タイトルが後から確定したとき（詳細ページのデータ取得後）に更新される', () => {
    const { rerender } = render(<Meta title={null} />)
    expect(document.title).toBe(DEFAULT_TITLE)

    rerender(<Meta title="ルビーの指輪 の買取" />)
    expect(document.title).toBe('ルビーの指輪 の買取 | MoE Trade')
  })
})
