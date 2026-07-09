import type { CustomTypeId, InventoryData } from '../types'

// 所有アイテム管理のクライアント側ヘルパー（純粋関数）。

let idSeq = 0
/** クライアント側のローカルキーを発行する（DB保存時はサーバーが採番し直す）。 */
export function newLocalId(prefix = 'i'): string {
  idSeq += 1
  return `${prefix}_${Date.now().toString(36)}_${idSeq.toString(36)}`
}

export function emptyInventory(): InventoryData {
  return { accounts: [], items: [], exclusions: [], customTypes: [] }
}

/** アイテム名を正規化（前後空白の除去）。種別割当の照合はアイテム名（文字列）単位。 */
export function normalizeName(name: string): string {
  return name.trim()
}

/**
 * 行の実効表示種別（ジャンル）を求める。
 *
 * 優先順位:
 *  1. ユーザーの種別割当に名前がある → その種別（共通種別の type_id か、カスタム種別の
 *     `ct_` 付き id。null は既定種別「その他」= defaultTypeId）。
 *     ユーザーが自分のアイテムボックス上で付けた分類は、管理者の共通割当より優先する（上書きできる）。
 *  2. 共通の種別割当（管理者）に名前がある → その type_id
 *  3. 登録アイテムに紐づく（itemId!=null）→ 'tradeable'（取引可能・派生種別）
 *  4. どれも無し → 'unset'（未設定）
 *
 * 登録アイテムに紐づく行でも、種別の割当（ユーザー／共通）があればそちらを優先する。
 * 割当を解除すると取引可能に戻る。
 *
 * commonMap / userMap のキーは正規化済みのアイテム名を想定する。
 */
export type EffectiveType = 'tradeable' | 'unset' | number | CustomTypeId

export function effectiveTypeId(
  row: { itemId: number | null; name: string },
  commonMap: Map<string, number>,
  userMap: Map<string, number | CustomTypeId | null>,
  defaultTypeId: number | null,
): EffectiveType {
  const name = normalizeName(row.name)
  if (userMap.has(name)) {
    const t = userMap.get(name)
    return t ?? (defaultTypeId ?? 'unset')
  }
  if (commonMap.has(name)) return commonMap.get(name)!
  if (row.itemId != null) return 'tradeable'
  return 'unset'
}

/** 値がカスタム種別の id（`ct_` プレフィックス付き文字列）かどうか。 */
export function isCustomTypeId(v: unknown): v is CustomTypeId {
  return typeof v === 'string' && v.startsWith('ct_')
}
