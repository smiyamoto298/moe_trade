import { describe, it, expect } from 'vitest'
import { normalizeOfficialUrl } from './officialUrl'

describe('normalizeOfficialUrl', () => {
  it('javascript:Move 形式を hidden_key 付きURLへ変換する', () => {
    expect(
      normalizeOfficialUrl("javascript:Move('https://moepic.com/top/news_detail.php','43ddbb90e533')")
    ).toBe('https://moepic.com/top/news_detail.php?hidden_key=43ddbb90e533')
  })

  it('ダブルクォート・前後空白・末尾セミコロンも受け付ける', () => {
    expect(normalizeOfficialUrl('  javascript:Move("https://moepic.com/x.php", "abc") ;  ')).toBe(
      'https://moepic.com/x.php?hidden_key=abc'
    )
  })

  it('既にクエリがあるURLは & で連結する', () => {
    expect(normalizeOfficialUrl("javascript:Move('https://moepic.com/x.php?a=1','k')")).toBe(
      'https://moepic.com/x.php?a=1&hidden_key=k'
    )
  })

  it('キーが空ならURLだけを返す', () => {
    expect(normalizeOfficialUrl("javascript:Move('https://moepic.com/x.php','')")).toBe(
      'https://moepic.com/x.php'
    )
  })

  it('ルート相対パスは公式サイトのオリジンで解決する', () => {
    expect(normalizeOfficialUrl("javascript:Move('/top/news_detail.php','167cd417')")).toBe(
      'https://moepic.com/top/news_detail.php?hidden_key=167cd417'
    )
  })

  it('プロトコル相対は https で解決する', () => {
    expect(normalizeOfficialUrl("javascript:Move('//moepic.com/x.php','k')")).toBe(
      'https://moepic.com/x.php?hidden_key=k'
    )
  })

  it('ディレクトリ相対パスの Move は変換せずそのまま返す', () => {
    const input = "javascript:Move('news_detail.php','abc')"
    expect(normalizeOfficialUrl(input)).toBe(input)
  })

  it('通常のURLや入力途中の文字列はそのまま返す', () => {
    expect(normalizeOfficialUrl('http://moepic.com/db/item/1')).toBe('http://moepic.com/db/item/1')
    expect(normalizeOfficialUrl('javascript:Move(')).toBe('javascript:Move(')
    expect(normalizeOfficialUrl('')).toBe('')
  })
})
