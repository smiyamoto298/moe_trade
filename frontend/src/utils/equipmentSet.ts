import type { Item } from '../types'

// 装備セットの構成部位（set_members）を、効果内容が同一の部位どうしでまとめるためのヘルパー。
// 一覧の「追加効果」「付加効果」列で、同一設定の部位名をまとめて表示し、
// 異なる設定の部位は別グループとして両方表示するために使う。

export interface PieceGroup {
  /** このグループに属する部位名（＝部位カテゴリ名。旧アイコンホバーで表示していたもの） */
  partNames: string[]
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

// 出現順を保ったままキーでグルーピングする
function groupBy(members: Item[], keyFn: (it: Item) => string): PieceGroup[] {
  const groups: PieceGroup[] = []
  const index = new Map<string, number>()
  for (const m of members) {
    const key = keyFn(m)
    const at = index.get(key)
    if (at === undefined) {
      index.set(key, groups.length)
      groups.push({ partNames: [partName(m)], member: m })
    } else {
      groups[at].partNames.push(partName(m))
    }
  }
  return groups
}

export const groupPiecesByBaseStats = (members: Item[]): PieceGroup[] =>
  groupBy(members, baseStatsKey)

export const groupPiecesByBonusEffects = (members: Item[]): PieceGroup[] =>
  groupBy(members, bonusEffectsKey)

// 追加効果が何かしら設定されているか（base_stats / ミスリル）
export const hasBaseStats = (it: Item): boolean =>
  Object.keys(it.base_stats ?? {}).length > 0 || it.mithril

// 付加効果が設定されているか
export const hasBonusEffects = (it: Item): boolean =>
  (it.bonus_effects ?? []).length > 0
