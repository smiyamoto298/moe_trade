import { BASE_STAT_LABELS } from './constants'

// 追加効果「その他」の1行（項目名は自由入力・値は数値文字列）
export interface CustomStatRow {
  label: string
  value: string
}

export const emptyCustomStat = (): CustomStatRow => ({ label: '', value: '' })

// item.base_stats(JSON) を固定パラメータ（BASE_STAT_LABELS のキー）と
// その他（自由入力の項目名がそのままキー）に分離する。編集フォームの読込用。
export function splitBaseStats(baseStats: Record<string, number | string> | null | undefined): {
  fixed: Record<string, string>
  custom: CustomStatRow[]
} {
  const fixed: Record<string, string> = {}
  const custom: CustomStatRow[] = []
  for (const [k, v] of Object.entries(baseStats ?? {})) {
    if (k in BASE_STAT_LABELS) fixed[k] = String(v)
    else custom.push({ label: k, value: String(v) })
  }
  return { fixed, custom }
}

// 固定パラメータの入力値とその他の行を API 送信用 base_stats にマージする。
// 空値・空項目名の行は除外する。固定パラメータと同じキー名（atk 等）の自由入力は
// 固定値の上書き事故を防ぐため無視する。
export function mergeBaseStats(
  fixed: Record<string, string>,
  custom: CustomStatRow[],
): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(
    Object.entries(fixed)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => [k, Number(v)]),
  )
  for (const row of custom) {
    const label = row.label.trim()
    if (!label || row.value === '' || label in BASE_STAT_LABELS) continue
    result[label] = Number(row.value)
  }
  return result
}
