import type { Item } from '../types'

// 装備セットの構成部位（set_members）を、効果内容が同一の部位どうしでまとめるためのヘルパー。
// 一覧の「追加効果」「付加効果」列で、同一設定の部位名をまとめて表示し、
// 異なる設定の部位は別グループとして両方表示するために使う。

export interface PieceGroup {
  /** このグループに属する部位名（＝部位カテゴリ名。旧アイコンホバーで表示していたもの） */
  partNames: string[]
  /** このグループに属する部位アイテム（出現順。詳細のセット内訳で名前つき表示に使う） */
  members: Item[]
  /** 効果を読み出すための代表メンバー（グループ内は効果が同一） */
  member: Item
}

// 部位名（カテゴリ名）。旧「装備セット」アイコンのホバーで表示していた頭/胴/手などの部位カテゴリ名。
const partName = (it: Item): string => it.category?.name ?? ''

// base_stats を順序非依存の安定したキーにする
function sortedStats(stats: Record<string, number> | null | undefined): [string, number][] {
  return Object.entries(stats ?? {}).sort(([a], [b]) => a.localeCompare(b))
}

// 追加効果（base_stats + ミスリル）が同一かを表すキー
function baseStatsKey(it: Item): string {
  return JSON.stringify({
    base_stats: sortedStats(it.base_stats),
    mithril: it.mithril,
  })
}

// 付加効果（bonus_effects。専用技フラグも含む）が同一かを表すキー（id は無視）
function bonusEffectsKey(it: Item): string {
  return JSON.stringify(
    (it.bonus_effects ?? []).map((e) => ({
      effect_name: e.effect_name,
      values: e.values,
      description: e.description,
      is_exclusive: !!e.is_exclusive,
    }))
  )
}

// 特殊条件が同一かを表すキー（順序非依存）
function specialConditionsKey(it: Item): string {
  return JSON.stringify([...(it.special_conditions ?? [])].sort())
}

// 必要スキル値・必要マスタリ（テクニック部位）が同一かを表すキー（順序非依存）
function requirementsKey(it: Item): string {
  return JSON.stringify({
    skill_requirements: sortedStats(it.skill_requirements),
    mastery_requirements: [...(it.mastery_requirements ?? [])].sort(),
  })
}

// 性能全体（追加効果・付加効果・特殊条件・必要スキル/マスタリ）が同一かを表すキー
function performanceKey(it: Item): string {
  return JSON.stringify([baseStatsKey(it), bonusEffectsKey(it), specialConditionsKey(it), requirementsKey(it)])
}

// 出現順を保ったままキーでグルーピングする
function groupBy(members: Item[], keyFn: (it: Item) => string): PieceGroup[] {
  const groups: PieceGroup[] = []
  const index = new Map<string, number>()
  for (const m of members) {
    const key = keyFn(m)
    const at = index.get(key)
    if (at === undefined) {
      index.set(key, groups.length)
      groups.push({ partNames: [partName(m)], members: [m], member: m })
    } else {
      groups[at].partNames.push(partName(m))
      groups[at].members.push(m)
    }
  }
  return groups
}

export const groupPiecesByBaseStats = (members: Item[]): PieceGroup[] =>
  groupBy(members, baseStatsKey)

export const groupPiecesByBonusEffects = (members: Item[]): PieceGroup[] =>
  groupBy(members, bonusEffectsKey)

export const groupPiecesBySpecialConditions = (members: Item[]): PieceGroup[] =>
  groupBy(members, specialConditionsKey)

// 詳細のセット内訳用。性能（追加効果・付加効果・特殊条件）がすべて同一の部位を1グループにまとめる
export const groupPiecesByPerformance = (members: Item[]): PieceGroup[] =>
  groupBy(members, performanceKey)

// 追加効果が何かしら設定されているか（base_stats / ミスリル）
export const hasBaseStats = (it: Item): boolean =>
  Object.keys(it.base_stats ?? {}).length > 0 || it.mithril

// 付加効果が設定されているか
export const hasBonusEffects = (it: Item): boolean =>
  (it.bonus_effects ?? []).length > 0

// 特殊条件が設定されているか
export const hasSpecialConditions = (it: Item): boolean =>
  (it.special_conditions ?? []).length > 0
