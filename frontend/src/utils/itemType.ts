import type { ItemCategory, ItemType } from '../types'

// 種別を表すトップカテゴリ名
export const TECHNIQUE_CATEGORY = 'テクニック'
export const ASSET_CATEGORY = 'アセット'
export const EQUIPMENT_SET_CATEGORY = '装備セット'

/**
 * カテゴリのトップ（最上位）カテゴリ名を返す。
 * 子カテゴリの場合は親名、トップカテゴリ自身の場合はその名前。
 * categories は itemsApi.categories() のレスポンス（トップカテゴリ配列）。
 */
export function topCategoryName(cat: ItemCategory, categories: ItemCategory[]): string {
  if (cat.parent_id == null) return cat.name
  const parent = categories.find((c) => c.id === cat.parent_id)
  return parent?.name ?? cat.name
}

/** カテゴリから種別（装備品 / テクニック / アセット）を判定する。 */
export function itemTypeOf(cat: ItemCategory, categories: ItemCategory[]): ItemType {
  const top = topCategoryName(cat, categories)
  if (top === TECHNIQUE_CATEGORY) return 'technique'
  if (top === ASSET_CATEGORY) return 'asset'
  return 'equipment'
}
