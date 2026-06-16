// usePageMeta — ページごとの <title> / meta description 設定（SEO）のテスト。
// 出品・買取の詳細ページでアイテム名がタイトルに入り、検索エンジンにヒットさせるための要。
import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { usePageMeta, DEFAULT_TITLE, DEFAULT_DESCRIPTION, SITE_ORIGIN, SITE_BRAND, type PageMetaOptions } from './usePageMeta'

function Meta({
  title,
  description,
  options,
}: {
  title?: string | null
  description?: string | null
  options?: PageMetaOptions
}) {
  usePageMeta(title, description, options)
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

  // ゲーム名の表記ゆれ（カタカナ・英語・略称）を既定メタに含め、ブランド系検索を取りこぼさない。
  // 「moe/moE」は検索が大文字小文字を区別しないため「MoE」表記で自動的にカバーされる。
  it('既定のタイトル・説明にゲーム名の表記ゆれを含む', () => {
    expect(SITE_BRAND).toContain('マスターオブエピック')
    expect(SITE_BRAND).toContain('Master of Epic')
    expect(SITE_BRAND).toContain('MoE')
    expect(DEFAULT_TITLE).toContain('マスターオブエピック')
    expect(DEFAULT_DESCRIPTION).toContain('マスターオブエピック')
  })

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

  const canonicalHref = () =>
    document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')

  it('canonicalPath を本番オリジンつきの絶対URLで設定し、アンマウントで除去する', () => {
    const { unmount } = render(<Meta title="x" options={{ canonicalPath: '/items/12' }} />)

    expect(canonicalHref()).toBe(`${SITE_ORIGIN}/items/12`)

    unmount()
    expect(canonicalHref()).toBeUndefined()
  })

  it('noindex 指定時のみ robots noindex を出力する', () => {
    const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content')

    const { rerender, unmount } = render(<Meta title="x" options={{ noindex: true }} />)
    expect(robots()).toBe('noindex')

    rerender(<Meta title="x" options={{ noindex: false }} />)
    expect(robots()).toBeUndefined()

    unmount()
  })

  it('jsonLd を application/ld+json スクリプトとして出力し、アンマウントで除去する', () => {
    const ld = { '@context': 'https://schema.org', '@type': 'Product', name: 'テストの剣' }
    const script = () => document.head.querySelector('script[type="application/ld+json"]')

    const { unmount } = render(<Meta title="x" options={{ jsonLd: ld }} />)
    expect(JSON.parse(script()?.textContent ?? '{}')).toEqual(ld)

    unmount()
    expect(script()).toBeNull()
  })
})
