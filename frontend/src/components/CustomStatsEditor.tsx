import ComboInput from './ComboInput'
import { emptyCustomStat, type CustomStatKind, type CustomStatRow } from '../utils/customStats'
import { isNumericValue } from '../utils/constants'

interface Props {
  // ComboInput の id 衝突を避けるための接頭辞（フォーム内で一意にする）
  idPrefix: string
  rows: CustomStatRow[]
  onChange: (rows: CustomStatRow[]) => void
  // 項目名の入力候補（管理画面の「追加効果の項目名」で管理されたリスト）
  labelOptions: string[]
}

/**
 * 追加効果「その他」の入力欄。
 * 固定パラメータ（攻撃力等）に無い効果を、項目名の自由入力＋値で任意件数追加する。
 * 値は付加効果と同様に「数値 / テキスト」を行ごとに選べる（テキストは文字列のまま保存）。
 * 保存時は mergeBaseStats() で base_stats の追加キーとしてマージされる。
 */
export default function CustomStatsEditor({ idPrefix, rows, onChange, labelOptions }: Props) {
  const setRow = (i: number, patch: Partial<CustomStatRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  // 種別を切り替える。テキスト→数値で数値にできない値は残さない（NaN の送信防止）
  const setKind = (i: number, kind: CustomStatKind) => {
    const row = rows[i]
    const keepValue = kind === 'number' && !isNumericValue(row.value) ? '' : row.value
    setRow(i, { kind, value: keepValue })
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-gray-400">その他</p>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_100px_88px_auto] gap-1.5 items-center">
          <ComboInput
            id={`${idPrefix}-custom-stat-${i}`}
            value={row.label}
            onChange={(val) => setRow(i, { label: val })}
            options={labelOptions}
            placeholder="項目名（自由入力）"
            className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 w-full"
          />
          <input
            type={row.kind === 'text' ? 'text' : 'number'}
            placeholder={row.kind === 'text' ? 'テキスト' : '数値'}
            aria-label={`その他の項目 ${i + 1} の値`}
            value={row.value}
            onChange={(e) => setRow(i, { value: e.target.value })}
            className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
          />
          <select
            value={row.kind}
            aria-label={`その他の項目 ${i + 1} の値の種別`}
            onChange={(e) => setKind(i, e.target.value as CustomStatKind)}
            className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-primary-500"
          >
            <option value="number">数値</option>
            <option value="text">テキスト</option>
          </select>
          <button
            type="button"
            aria-label={`その他の項目 ${i + 1} を削除`}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="text-red-400 text-sm"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, emptyCustomStat()])}
        className="text-xs text-primary-500 hover:underline"
      >
        + その他の項目を追加
      </button>
    </div>
  )
}
