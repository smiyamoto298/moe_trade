import { BASE_STAT_LABELS, isNumericValue } from './constants'

// 追加効果「その他」の値の種別。number = 数値 / text = テキスト（付加効果の value_unit='text' と同じ扱い）
export type CustomStatKind = 'number' | 'text'

// 追加効果「その他」の1行（項目名は自由入力・値は数値かテキストのいずれか）
export interface CustomStatRow {
  label: string
  value: string
  kind: CustomStatKind
}

export const emptyCustomStat = (): CustomStatRow => ({ label: '', value: '', kind: 'number' })

// item.base_stats(JSON) を固定パラメータ（BASE_STAT_LABELS のキー）と
// その他（自由入力の項目名がそのままキー）に分離する。編集フォームの読込用。
// その他の値は数値として扱えなければ kind='text' として復元する。
export function splitBaseStats(baseStats: Record<string, number | string> | null | undefined): {
  fixed: Record<string, string>
  custom: CustomStatRow[]
} {
  const fixed: Record<string, string> = {}
  const custom: CustomStatRow[] = []
  for (const [k, v] of Object.entries(baseStats ?? {})) {
    if (k in BASE_STAT_LABELS) fixed[k] = String(v)
    else custom.push({ label: k, value: String(v), kind: isNumericValue(v) ? 'number' : 'text' })
  }
  return { fixed, custom }
}

// 固定パラメータの入力値とその他の行を API 送信用 base_stats にマージする。
// 空値・空項目名の行は除外する。固定パラメータと同じキー名（atk 等）の自由入力は
// 固定値の上書き事故を防ぐため無視する。
// その他は kind='number' なら数値化、kind='text' なら文字列のまま保存する。
export function mergeBaseStats(
  fixed: Record<string, string>,
  custom: CustomStatRow[],
): Record<string, number | string> {
  const result: Record<string, number | string> = Object.fromEntries(
    Object.entries(fixed)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => [k, Number(v)]),
  )
  for (const row of custom) {
    const label = row.label.trim()
    const value = row.kind === 'text' ? row.value.trim() : row.value
    if (!label || value === '' || label in BASE_STAT_LABELS) continue
    if (row.kind === 'text') {
      result[label] = value
      continue
    }
    // 数値にできない値（NaN）は送らない
    if (!isNumericValue(value)) continue
    result[label] = Number(value)
  }
  return result
}
