import type { ItemCategory, ItemType } from '../types'

// 種別を表すトップカテゴリ名
export const TECHNIQUE_CATEGORY = 'テクニック'
export const ASSET_CATEGORY = 'アセット'
export const EQUIPMENT_SET_CATEGORY = '装備セット'
// 既存種別に当てはまらないアイテムの親種別（子: 未開封ペット / レシピ）
export const OTHER_CATEGORY = 'その他'
export const OTHER_PET = '未開封ペット'
export const OTHER_RECIPE = 'レシピ'

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

/** カテゴリから種別（装備品 / テクニック / アセット / その他）を判定する。 */
export function itemTypeOf(cat: ItemCategory, categories: ItemCategory[]): ItemType {
  const top = topCategoryName(cat, categories)
  if (top === TECHNIQUE_CATEGORY) return 'technique'
  if (top === ASSET_CATEGORY) return 'asset'
  if (top === OTHER_CATEGORY) return 'other'
  return 'equipment'
}

/**
 * テクニック配下（ノアピース・秘伝の書など）のカテゴリID集合を返す（親のテクニック自身を含む）。
 * 装備セットの構成部位でテクニック部位を判定するために使う。
 */
export function techniqueCategoryIds(categories: ItemCategory[]): Set<number> {
  const top = categories.find((c) => c.parent_id == null && c.name === TECHNIQUE_CATEGORY)
  return new Set(top ? [top.id, ...(top.children ?? []).map((c) => c.id)] : [])
}
