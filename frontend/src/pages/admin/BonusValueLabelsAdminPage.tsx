import { useEffect, useState, type DragEvent } from 'react'
import { bonusValueLabelsApi, type BonusValueLabel } from '../../api/bonusValueLabels'
import { useDialog } from '../../contexts/DialogContext'
import { compareJa } from '../../utils/collator'

interface Row {
  id: number
  label: string
  // 入力中の編集値（label と異なれば未保存）
  draft: string
}

const toRow = (b: BonusValueLabel): Row => ({ id: b.id, label: b.label, draft: b.label })

export default function BonusValueLabelsAdminPage() {
  const { confirm, alert } = useDialog()
  // 左ペイン（整理済み・並び順あり）／右ペイン（未整理・文字順）
  const [organized, setOrganized] = useState<Row[]>([])
  const [unorganized, setUnorganized] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)

  // ドラッグ状態
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null) // 左ペインの挿入位置
  const [overRight, setOverRight] = useState(false)

  const load = () => {
    setLoading(true)
    bonusValueLabelsApi
      .adminList()
      .then((r) => {
        const rows = r.data
        setOrganized(rows.filter((b) => b.is_organized).map(toRow))
        setUnorganized(
          rows
            .filter((b) => !b.is_organized)
            .map(toRow)
            .sort((a, b) => compareJa(a.label, b.label)),
        )
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const setDraft = (id: number, val: string) => {
    const upd = (rows: Row[]) => rows.map((r) => (r.id === id ? { ...r, draft: val } : r))
    setOrganized(upd)
    setUnorganized(upd)
  }

  const add = async () => {
    const label = newLabel.trim()
    if (!label) return
    if ([...organized, ...unorganized].some((r) => r.label === label)) {
      await alert('同じ項目名が既に登録されています。', { title: '重複' })
      return
    }
    setAdding(true)
    try {
      // 手動追加は「未整理（右）」に入る
      const res = await bonusValueLabelsApi.create(label)
      setUnorganized((p) => [...p, toRow(res.data)].sort((a, b) => compareJa(a.label, b.label)))
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
      const updated = toRow(res.data)
      setOrganized((p) => p.map((r) => (r.id === row.id ? updated : r)))
      setUnorganized((p) =>
        p.map((r) => (r.id === row.id ? updated : r)).sort((a, b) => compareJa(a.label, b.label)),
      )
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
      setOrganized((p) => p.filter((r) => r.id !== row.id))
      setUnorganized((p) => p.filter((r) => r.id !== row.id))
    } catch {
      await alert('削除に失敗しました。', { title: 'エラー' })
    }
  }

  // 整理済みの並び(ids)を確定してサーバへ保存。失敗時は再読込でロールバック。
  const persistOrganized = async (organizedIds: number[]) => {
    const all = [...organized, ...unorganized]
    const byId = new Map(all.map((r) => [r.id, r]))
    const orgSet = new Set(organizedIds)
    const newOrganized = organizedIds.map((id) => byId.get(id)).filter((r): r is Row => !!r)
    const newUnorganized = all
      .filter((r) => !orgSet.has(r.id))
      .sort((a, b) => compareJa(a.label, b.label))
    // 楽観的更新
    setOrganized(newOrganized)
    setUnorganized(newUnorganized)
    try {
      await bonusValueLabelsApi.organize(organizedIds)
    } catch {
      await alert('並びの保存に失敗しました。', { title: 'エラー' })
      load()
    }
  }

  const clearDrag = () => {
    setDragId(null)
    setDropIndex(null)
    setOverRight(false)
  }

  const onCardDragStart = (id: number) => () => setDragId(id)

  // 左ペインのカード上で、上半分なら手前・下半分なら後ろに挿入位置を出す
  const onLeftCardDragOver = (idx: number) => (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragId === null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    setDropIndex(after ? idx + 1 : idx)
    setOverRight(false)
  }

  const onLeftContainerDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (dragId === null) return
    // カードの外（末尾の余白）に重なったら末尾に挿入
    if (dropIndex === null) setDropIndex(organized.length)
    setOverRight(false)
  }

  const onLeftDrop = (e: DragEvent) => {
    e.preventDefault()
    if (dragId === null) return
    const insertAt = dropIndex ?? organized.length
    const current = organized.map((r) => r.id)
    // 表示中リスト座標で挿入し、元の出現を取り除く（左内並べ替え・右→左の両対応）
    const next = [...current]
    next.splice(insertAt, 0, dragId)
    const organizedIds = next.filter((id, i) => id !== dragId || i === insertAt)
    clearDrag()
    void persistOrganized(organizedIds)
  }

  const onRightDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (dragId === null) return
    setOverRight(true)
    setDropIndex(null)
  }

  const onRightDrop = (e: DragEvent) => {
    e.preventDefault()
    if (dragId === null) return
    // 左→右（整理の取り消し）。右→右は実質変化なし。
    const organizedIds = organized.map((r) => r.id).filter((id) => id !== dragId)
    const changed = organizedIds.length !== organized.length
    clearDrag()
    if (changed) void persistOrganized(organizedIds)
  }

  const renderCard = (row: Row) => (
    <div
      key={row.id}
      draggable
      onDragStart={onCardDragStart(row.id)}
      onDragEnd={clearDrag}
      className={`flex items-center gap-2 bg-surface-card border rounded-lg px-2 py-1.5 transition-colors ${
        dragId === row.id ? 'border-primary-500 opacity-50' : 'border-surface-border'
      }`}
    >
      <span
        title="ドラッグして移動"
        className="cursor-grab active:cursor-grabbing select-none text-gray-500 hover:text-gray-300 text-lg leading-none px-1"
      >
        ⠿
      </span>
      <input
        type="text"
        value={row.draft}
        onChange={(e) => setDraft(row.id, e.target.value)}
        // input 上ではドラッグせずテキスト選択できるようにする
        draggable={false}
        className="flex-1 min-w-0 bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
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
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-2">付加効果 項目名の管理</h1>
      <p className="text-sm text-gray-400 mb-5">
        ここで登録した項目名が、アイテム登録の「付加効果 → 項目名」の入力候補と、一覧の絞り込み候補に表示されます。
        右の<span className="text-gray-300">「未整理」</span>のカードを左の
        <span className="text-gray-300">「整理済み」</span>へドラッグして、任意の位置に並べてください。
        候補は<span className="text-gray-300">整理済み → 未整理</span>の順で表示されます。
      </p>

      {/* 新規追加（未整理に入る） */}
      <div className="flex items-center gap-2 mb-5">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="例: 攻撃力（追加後は「未整理」に入ります）"
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 整理済み（左） */}
          <section>
            <h2 className="text-sm font-bold text-white mb-2">
              整理済み <span className="text-gray-500 font-normal">({organized.length})</span>
            </h2>
            <div
              data-testid="organized-dropzone"
              onDragOver={onLeftContainerDragOver}
              onDrop={onLeftDrop}
              className={`min-h-[8rem] rounded-lg border border-dashed p-2 transition-colors ${
                dragId !== null && !overRight ? 'border-primary-500/60 bg-primary-500/5' : 'border-surface-border'
              }`}
            >
              {organized.length === 0 && dropIndex === null && (
                <p className="text-center text-xs text-gray-600 py-8">
                  ここに未整理の項目をドラッグして並べます
                </p>
              )}
              <div className="space-y-1.5">
                {organized.map((row, idx) => (
                  <div key={row.id} onDragOver={onLeftCardDragOver(idx)}>
                    {dragId !== null && dropIndex === idx && (
                      <div className="h-0.5 bg-primary-500 rounded my-1" />
                    )}
                    {renderCard(row)}
                  </div>
                ))}
                {dragId !== null && dropIndex === organized.length && (
                  <div className="h-0.5 bg-primary-500 rounded my-1" />
                )}
              </div>
            </div>
          </section>

          {/* 未整理（右） */}
          <section>
            <h2 className="text-sm font-bold text-white mb-2">
              未整理 <span className="text-gray-500 font-normal">({unorganized.length})</span>
            </h2>
            <div
              data-testid="unorganized-dropzone"
              onDragOver={onRightDragOver}
              onDrop={onRightDrop}
              className={`min-h-[8rem] rounded-lg border border-dashed p-2 transition-colors ${
                dragId !== null && overRight ? 'border-primary-500/60 bg-primary-500/5' : 'border-surface-border'
              }`}
            >
              {unorganized.length === 0 ? (
                <p className="text-center text-xs text-gray-600 py-8">未整理の項目はありません。</p>
              ) : (
                <div className="space-y-1.5">
                  {unorganized.map((row) => renderCard(row))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
