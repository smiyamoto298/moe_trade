import { describe, it, expect } from 'vitest'
import { selectedCommonNames } from './inventory'

// 種別: 1=その他(既定), 2=イベント, 3=レア
const items = [
  { name: 'ゴミ', type_id: 1 },   // その他
  { name: '木の枝', type_id: 1 }, // その他
  { name: '花火', type_id: 2 },   // イベント
  { name: 'お宝', type_id: 3 },   // レア
]

describe('selectedCommonNames', () => {
  it('ユーザー未設定かつdefaultEnabled未指定なら全種別を適用する（後方互換）', () => {
    const names = selectedCommonNames(items, null, 1, [])
    expect(names.sort()).toEqual(['お宝', 'ゴミ', '木の枝', '花火'].sort())
  })

  it('ユーザー未設定なら管理者の既定ON種別だけを適用する（その他はアイテム単位で全適用）', () => {
    // 既定ONはイベント(2)のみ。レア(3)は既定OFF。
    const names = selectedCommonNames(items, null, 1, [], [2])
    // その他(ゴミ・木の枝)＋イベント(花火)。レア(お宝)は含まない。
    expect(names.sort()).toEqual(['ゴミ', '木の枝', '花火'].sort())
  })

  it('ユーザーが明示選択したら既定ON/OFFより選択が優先される', () => {
    // ユーザーはレア(3)だけを選択 → その他は常にアイテム単位で適用される
    const names = selectedCommonNames(items, [3], 1, [], [2])
    expect(names.sort()).toEqual(['ゴミ', '木の枝', 'お宝'].sort())
  })

  it('その他のアイテムはdisabledOtherNamesで個別にOFFにできる', () => {
    const names = selectedCommonNames(items, null, 1, ['木の枝'], [2])
    expect(names.sort()).toEqual(['ゴミ', '花火'].sort())
  })
})
