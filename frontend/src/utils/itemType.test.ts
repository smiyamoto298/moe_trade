import { describe, it, expect } from 'vitest'
import type { ItemCategory } from '../types'
import {
  topCategoryName,
  itemTypeOf,
  techniqueCategoryIds,
  TECHNIQUE_CATEGORY,
  ASSET_CATEGORY,
} from './itemType'

// design.md「出品一覧のタブとルーティング」:
// 種別判定はアイテムの最上位カテゴリ名で行う。
// テクニック→technique / アセット→asset / それ以外→equipment

const cat = (id: number, name: string, parent_id: number | null = null): ItemCategory => ({
  id,
  name,
  parent_id,
  sort_order: 0,
})

// itemsApi.categories() 相当のトップカテゴリ配列
const tops: ItemCategory[] = [
  cat(1, '武器'),
  cat(2, '防具'),
  cat(3, TECHNIQUE_CATEGORY),
  cat(4, ASSET_CATEGORY),
  cat(5, '装備セット'),
]

describe('topCategoryName', () => {
  it('トップカテゴリ自身はその名前を返す', () => {
    expect(topCategoryName(cat(1, '武器'), tops)).toBe('武器')
  })

  it('子カテゴリは親カテゴリ名を返す', () => {
    expect(topCategoryName(cat(11, '刀剣', 1), tops)).toBe('武器')
    expect(topCategoryName(cat(31, 'ノアピース', 3), tops)).toBe(TECHNIQUE_CATEGORY)
  })

  it('親が見つからない場合は自身の名前にフォールバックする', () => {
    expect(topCategoryName(cat(99, '謎カテゴリ', 999), tops)).toBe('謎カテゴリ')
  })
})

describe('itemTypeOf', () => {
  it('テクニック配下（ノアピース・秘伝の書）は technique', () => {
    expect(itemTypeOf(cat(31, 'ノアピース', 3), tops)).toBe('technique')
    expect(itemTypeOf(cat(32, '秘伝の書', 3), tops)).toBe('technique')
    expect(itemTypeOf(cat(3, TECHNIQUE_CATEGORY), tops)).toBe('technique')
  })

  it('アセットは asset（子カテゴリを持たない特殊カテゴリ）', () => {
    expect(itemTypeOf(cat(4, ASSET_CATEGORY), tops)).toBe('asset')
  })

  it('武器・防具・装備セットなどそれ以外は equipment', () => {
    expect(itemTypeOf(cat(11, '刀剣', 1), tops)).toBe('equipment')
    expect(itemTypeOf(cat(2, '防具'), tops)).toBe('equipment')
    expect(itemTypeOf(cat(5, '装備セット'), tops)).toBe('equipment')
  })
})

describe('techniqueCategoryIds', () => {
  it('テクニック本体と子カテゴリ（ノアピース・秘伝の書）のIDを返す', () => {
    const withChildren: ItemCategory[] = [
      cat(1, '武器'),
      {
        ...cat(3, TECHNIQUE_CATEGORY),
        children: [cat(31, 'ノアピース', 3), cat(32, '秘伝の書', 3)],
      },
    ]
    expect([...techniqueCategoryIds(withChildren)].sort()).toEqual([3, 31, 32])
  })

  it('テクニックカテゴリが無ければ空集合を返す', () => {
    expect(techniqueCategoryIds([cat(1, '武器')]).size).toBe(0)
  })
})
