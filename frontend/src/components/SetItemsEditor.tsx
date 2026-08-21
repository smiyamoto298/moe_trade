// ───────────────────────────────────────────────────────────
// アイテムセット / 選べるチケット（その他種別）の「アイテムリスト」入力エディタ。
// ・セットに含まれる（＝選べるチケットなら選択できる）アイテム名を自由入力テキストで複数登録できる。
// ・どちらも同じ set_items カラムに保存する。文言だけ emptyHint で切り替える。
// ・送信時は setItemsToPayload() で空エントリを除去する（バックエンドでも同様に正規化）。
// ───────────────────────────────────────────────────────────

// 送信用ペイロードへ変換する。空白のみのエントリは除去し、全て空なら null を返す。
export const setItemsToPayload = (items: string[]): string[] | null => {
  const cleaned = items.map((s) => s.trim()).filter((s) => s !== '')
  return cleaned.length > 0 ? cleaned : null
}

interface Props {
  value: string[]
  onChange: (items: string[]) => void
  /** 1件も無いときの説明文（種別で文言を変える）。 */
  emptyHint?: string
}

export default function SetItemsEditor({
  value,
  onChange,
  emptyHint = '「＋ アイテムを追加」で、セットに含まれるアイテム名を登録できます。',
}: Props) {
  const update = (i: number, name: string) =>
    onChange(value.map((s, idx) => (idx === i ? name : s)))
  const add = () => onChange([...value, ''])
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-xs text-gray-500">{emptyHint}</p>}
      {value.map((name, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => update(i, e.target.value)}
            className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
            placeholder={`アイテム ${i + 1}`}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-xs text-red-400 hover:text-red-300 shrink-0"
          >
            削除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs px-3 py-1.5 rounded border border-primary-500/40 text-primary-300 hover:bg-primary-500/10"
      >
        ＋ アイテムを追加
      </button>
    </div>
  )
}
