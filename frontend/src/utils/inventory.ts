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

/** アイテム名を正規化（前後空白の除去）。種別割当の照合はアイテム名（文字列）単位。 */
export function normalizeName(name: string): string {
  return name.trim()
}

/**
 * 行の実効表示種別（ジャンル）を求める。
 *
 * 優先順位:
 *  1. 登録アイテムに紐づく（itemId!=null）→ 'tradeable'（取引可能・派生種別）
 *  2. 共通の種別割当（管理者）に名前がある → その type_id
 *  3. ユーザーの種別割当に名前がある → その type_id（null は既定種別「その他」= defaultTypeId）
 *  4. どれも無し → 'unset'（未設定）
 *
 * commonMap / userMap のキーは正規化済みのアイテム名を想定する。
 */
export type EffectiveType = 'tradeable' | 'unset' | number

export function effectiveTypeId(
  row: { itemId: number | null; name: string },
  commonMap: Map<string, number>,
  userMap: Map<string, number | null>,
  defaultTypeId: number | null,
): EffectiveType {
  if (row.itemId != null) return 'tradeable'
  const name = normalizeName(row.name)
  if (commonMap.has(name)) return commonMap.get(name)!
  if (userMap.has(name)) {
    const t = userMap.get(name)
    return t ?? (defaultTypeId ?? 'unset')
  }
  return 'unset'
}
