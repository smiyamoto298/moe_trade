import type { ItemCategory, ItemType } from '../types'

// 種別を表すトップカテゴリ名
export const TECHNIQUE_CATEGORY = 'テクニック'
export const ASSET_CATEGORY = 'アセット'
export const EQUIPMENT_SET_CATEGORY = '装備セット'
// 既存種別に当てはまらないアイテムの親種別（子: 未開封ペット / レシピ / ペット用アイテム / アイテムセット / 選べるチケット）
export const OTHER_CATEGORY = 'その他'
export const OTHER_PET = '未開封ペット'
export const OTHER_RECIPE = 'レシピ'
export const OTHER_PET_ITEM = 'ペット用アイテム'
export const OTHER_ITEM_SET = 'アイテムセット'
export const OTHER_CHOICE_TICKET = '選べるチケット'

/**
 * アイテム名リスト（set_items）を持つ「その他」子カテゴリか判定する。
 * アイテムセット（セットに含まれるアイテム）と選べるチケット（選択できるアイテム）が該当し、
 * どちらも同じ set_items カラムに文字列配列で保持する。
 */
export function hasSetItems(categoryName: string): boolean {
  return categoryName === OTHER_ITEM_SET || categoryName === OTHER_CHOICE_TICKET
}

/** set_items の見出しラベル（アイテムセット=アイテムリスト / 選べるチケット=選べるアイテム）。 */
export function setItemsLabel(categoryName: string): string {
  return categoryName === OTHER_CHOICE_TICKET ? '選べるアイテム' : 'アイテムリスト'
}

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
