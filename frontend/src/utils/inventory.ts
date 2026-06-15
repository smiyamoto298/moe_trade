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

/**
 * 共通除外アイテムを「適用する種別」で絞り込んだ名前の配列を返す。
 *
 * - 既定種別「その他」（defaultTypeId）のアイテムは **アイテム単位** で適用する。
 *   disabledOtherNames に入っている名前だけ除外する（既定は空＝全適用＝オプトアウト方式）。
 * - それ以外の種別は **種別単位** で適用する。selectedTypeIds が null（未設定）なら全種別を適用する。
 */
export function selectedCommonNames(
  items: { name: string; type_id: number }[],
  selectedTypeIds: number[] | null,
  defaultTypeId: number | null = null,
  disabledOtherNames: string[] = []
): string[] {
  const typeSet = selectedTypeIds == null ? null : new Set(selectedTypeIds)
  const disabled = new Set(disabledOtherNames)
  return items
    .filter((i) => {
      if (defaultTypeId != null && i.type_id === defaultTypeId) {
        return !disabled.has(i.name)
      }
      return typeSet == null ? true : typeSet.has(i.type_id)
    })
    .map((i) => i.name)
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
