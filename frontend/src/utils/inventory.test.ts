import { describe, it, expect } from 'vitest'
import { effectiveTypeId } from './inventory'

// 種別: 1=その他(既定), 2=イベント, 3=レア
const commonMap = new Map<string, number>([
  ['ゴミ', 1],
  ['花火', 2],
])
const userMap = new Map<string, number | null>([
  ['お宝', 3],
  ['なぞ', null], // 種別未指定 → 既定種別「その他」(=1) に解決
])
const DEFAULT_TYPE_ID = 1

const row = (over: Partial<{ itemId: number | null; name: string }>) => ({
  itemId: null,
  name: '',
  ...over,
})

describe('effectiveTypeId', () => {
  it('登録アイテムに紐づく行は取引可能になる', () => {
    expect(effectiveTypeId(row({ itemId: 10, name: '炎の剣' }), commonMap, userMap, DEFAULT_TYPE_ID)).toBe('tradeable')
    // 名前が割当にあっても itemId があれば取引可能が優先
    expect(effectiveTypeId(row({ itemId: 10, name: 'ゴミ' }), commonMap, userMap, DEFAULT_TYPE_ID)).toBe('tradeable')
  })

  it('共通割当はユーザー割当より優先される', () => {
    const cm = new Map([['花火', 2]])
    const um = new Map<string, number | null>([['花火', 3]])
    expect(effectiveTypeId(row({ name: '花火' }), cm, um, DEFAULT_TYPE_ID)).toBe(2)
  })

  it('共通割当の種別IDを返す', () => {
    expect(effectiveTypeId(row({ name: 'ゴミ' }), commonMap, userMap, DEFAULT_TYPE_ID)).toBe(1)
    expect(effectiveTypeId(row({ name: '花火' }), commonMap, userMap, DEFAULT_TYPE_ID)).toBe(2)
  })

  it('ユーザー割当の種別IDを返す（null は既定種別へ解決）', () => {
    expect(effectiveTypeId(row({ name: 'お宝' }), commonMap, userMap, DEFAULT_TYPE_ID)).toBe(3)
    expect(effectiveTypeId(row({ name: 'なぞ' }), commonMap, userMap, DEFAULT_TYPE_ID)).toBe(1)
  })

  it('どの割当にも無い未登録行は未設定になる', () => {
    expect(effectiveTypeId(row({ name: '未分類' }), commonMap, userMap, DEFAULT_TYPE_ID)).toBe('unset')
  })

  it('前後の空白は正規化して照合する', () => {
    expect(effectiveTypeId(row({ name: '  ゴミ  ' }), commonMap, userMap, DEFAULT_TYPE_ID)).toBe(1)
  })
})
