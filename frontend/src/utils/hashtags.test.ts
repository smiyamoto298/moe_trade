import { describe, it, expect } from 'vitest'
import { parseHashtags, formatHashtags } from './hashtags'

describe('parseHashtags', () => {
  it('# / ＃ を除去し空白区切りで分割する', () => {
    expect(parseHashtags('#和風 #袴')).toEqual(['和風', '袴'])
    expect(parseHashtags('＃全角 通常')).toEqual(['全角', '通常'])
  })

  it('大文字小文字を無視して重複を排除する', () => {
    expect(parseHashtags('Rare #rare RARE')).toEqual(['Rare'])
  })

  it('カンマ・読点でも区切れる', () => {
    expect(parseHashtags('#a, #b、#c')).toEqual(['a', 'b', 'c'])
  })

  it('空入力は空配列', () => {
    expect(parseHashtags('   ')).toEqual([])
  })
})

describe('formatHashtags', () => {
  it('タグ配列を #付きスペース区切りにする', () => {
    expect(formatHashtags([{ id: 1, tag: '和風', is_fixed: false }, { id: 2, tag: '袴', is_fixed: false }]))
      .toBe('#和風 #袴')
    expect(formatHashtags(['a', 'b'])).toBe('#a #b')
    expect(formatHashtags(null)).toBe('')
  })
})
