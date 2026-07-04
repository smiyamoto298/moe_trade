import ComboInput from './ComboInput'
import { emptyCustomStat, type CustomStatRow } from '../utils/customStats'

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
 * 固定パラメータ（攻撃力等）に無い効果を、項目名の自由入力＋数値で任意件数追加する。
 * 保存時は mergeBaseStats() で base_stats の追加キーとしてマージされる。
 */
export default function CustomStatsEditor({ idPrefix, rows, onChange, labelOptions }: Props) {
  const setRow = (i: number, patch: Partial<CustomStatRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-gray-400">その他</p>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_100px_auto] gap-1.5 items-center">
          <ComboInput
            id={`${idPrefix}-custom-stat-${i}`}
            value={row.label}
            onChange={(val) => setRow(i, { label: val })}
            options={labelOptions}
            placeholder="項目名（自由入力）"
            className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 w-full"
          />
          <input
            type="number"
            placeholder="数値"
            value={row.value}
            onChange={(e) => setRow(i, { value: e.target.value })}
            className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
          />
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
