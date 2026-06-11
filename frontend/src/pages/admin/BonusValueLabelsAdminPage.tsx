import { useEffect, useState } from 'react'
import { bonusValueLabelsApi, type BonusValueLabel } from '../../api/bonusValueLabels'
import { useDialog } from '../../contexts/DialogContext'
import { useDragReorder } from '../../hooks/useDragReorder'

interface Row {
  id: number
  label: string
  // 入力中の編集値（label と異なれば未保存）
  draft: string
}

const toRow = (b: BonusValueLabel): Row => ({ id: b.id, label: b.label, draft: b.label })

export default function BonusValueLabelsAdminPage() {
  const { confirm, alert } = useDialog()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)

  const { dragIdx, onDragStart, onDragOver, onDrop } = useDragReorder<Row>(setRows, async (items) => {
    const ids = items.map((r) => r.id)
    if (ids.length < 2) return
    try {
      await bonusValueLabelsApi.reorder(ids)
    } catch {
      await alert('並び順の保存に失敗しました。', { title: 'エラー' })
      load()
    }
  })

  const load = () => {
    setLoading(true)
    bonusValueLabelsApi
      .adminList()
      .then((r) => setRows(r.data.map(toRow)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const setDraft = (id: number, val: string) =>
    setRows((p) => p.map((r) => (r.id === id ? { ...r, draft: val } : r)))

  const add = async () => {
    const label = newLabel.trim()
    if (!label) return
    if (rows.some((r) => r.label === label)) {
      await alert('同じ項目名が既に登録されています。', { title: '重複' })
      return
    }
    setAdding(true)
    try {
      const res = await bonusValueLabelsApi.create(label)
      setRows((p) => [...p, toRow(res.data)])
      setNewLabel('')
    } catch {
      await alert('追加に失敗しました。', { title: 'エラー' })
    } finally {
      setAdding(false)
    }
  }

  const save = async (row: Row) => {
    const label = row.draft.trim()
    if (!label) {
      await alert('項目名を入力してください。', { title: '入力エラー' })
      return
    }
    if (label === row.label) return
    setSavingId(row.id)
    try {
      const res = await bonusValueLabelsApi.update(row.id, label)
      setRows((p) => p.map((r) => (r.id === row.id ? toRow(res.data) : r)))
    } catch {
      await alert('保存に失敗しました。重複していないかご確認ください。', { title: 'エラー' })
    } finally {
      setSavingId(null)
    }
  }

  const remove = async (row: Row) => {
    if (!(await confirm(`「${row.label}」を削除しますか？`, { title: '項目名の削除', confirmLabel: '削除', danger: true }))) return
    try {
      await bonusValueLabelsApi.remove(row.id)
      setRows((p) => p.filter((r) => r.id !== row.id))
    } catch {
      await alert('削除に失敗しました。', { title: 'エラー' })
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-2">付加効果 項目名の管理</h1>
      <p className="text-sm text-gray-400 mb-5">
        ここで登録した項目名が、アイテム登録の「付加効果 → 項目名」の入力候補と、一覧の絞り込み候補に表示されます。
        左の <span className="text-gray-300">⠿</span> をドラッグすると候補の並び順を変更できます。
      </p>

      {/* 新規追加 */}
      <div className="flex items-center gap-2 mb-5">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="例: 攻撃力"
          className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
        />
        <button
          onClick={add}
          disabled={adding || !newLabel.trim()}
          className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-2 rounded-md transition-colors whitespace-nowrap"
        >
          + 追加
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg text-sm text-gray-500">
          項目名はありません。上のフォームから追加できます。
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, idx) => (
            <div
              key={row.id}
              onDragOver={onDragOver(idx)}
              onDrop={onDrop}
              className={`flex items-center gap-2 bg-surface-card border rounded-lg px-2 py-1.5 transition-colors ${
                dragIdx === idx ? 'border-primary-500 opacity-70' : 'border-surface-border'
              }`}
            >
              <span
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragEnd={onDrop}
                title="ドラッグして並び替え"
                className="cursor-grab active:cursor-grabbing select-none text-gray-500 hover:text-gray-300 text-lg leading-none px-1"
              >
                ⠿
              </span>
              <input
                type="text"
                value={row.draft}
                onChange={(e) => setDraft(row.id, e.target.value)}
                className="flex-1 bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
              />
              <button
                onClick={() => save(row)}
                disabled={savingId === row.id || row.draft.trim() === row.label || !row.draft.trim()}
                className="text-xs bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-3 py-1.5 rounded transition-colors"
              >
                {savingId === row.id ? '保存中' : '保存'}
              </button>
              <button
                onClick={() => remove(row)}
                className="text-xs bg-red-900/40 hover:bg-red-900/70 text-red-300 px-3 py-1.5 rounded transition-colors"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
