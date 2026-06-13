import { describe, it, expect } from 'vitest'
import { compareJa } from './collator'

describe('compareJa', () => {
  it('あいうえお順（日本語ロケール）で並べ替える', () => {
    const sorted = ['さくら', 'あいね', 'こいし', 'きのえだ'].sort(compareJa)
    expect(sorted).toEqual(['あいね', 'きのえだ', 'こいし', 'さくら'])
  })

  it('localeCompare(_, "ja") と同じ並び順になる（置き換え後も挙動を変えない）', () => {
    const names = ['木の枝', 'ゴミ', '小石', 'アイネ', 'アクアマリン', 'みすりる', 'ミスリル']
    const viaCollator = [...names].sort(compareJa)
    const viaLocaleCompare = [...names].sort((a, b) => a.localeCompare(b, 'ja'))
    expect(viaCollator).toEqual(viaLocaleCompare)
  })

  it('同名は 0 を返す（安定比較）', () => {
    expect(compareJa('ゴミ', 'ゴミ')).toBe(0)
  })
})
