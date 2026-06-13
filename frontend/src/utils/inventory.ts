import type { InventoryData } from '../types'

// 所有アイテム管理のクライアント側ヘルパー（純粋関数）。

let idSeq = 0
/** クライアント側のローカルキーを発行する（DB保存時はサーバーが採番し直す）。 */
export function newLocalId(prefix = 'i'): string {
  idSeq += 1
  return `${prefix}_${Date.now().toString(36)}_${idSeq.toString(36)}`
}

export function emptyInventory(): InventoryData {
  return { accounts: [], items: [], exclusions: [] }
}

/** 除外判定用にアイテム名を正規化（前後空白の除去）。判定はアイテム名（文字列）単位。 */
export function normalizeExcludeName(name: string): string {
  return name.trim()
}

/** 共通除外（管理者）と個別除外（ユーザー）をマージした除外名セットを作る。 */
export function buildExclusionSet(common: string[], personal: string[]): Set<string> {
  const set = new Set<string>()
  for (const n of [...common, ...personal]) {
    const norm = normalizeExcludeName(n)
    if (norm) set.add(norm)
  }
  return set
}

/** 指定名が除外対象か（完全一致）。 */
export function isExcluded(name: string, set: Set<string>): boolean {
  return set.has(normalizeExcludeName(name))
}
