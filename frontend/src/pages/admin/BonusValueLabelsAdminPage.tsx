import { useEffect, useState, type DragEvent } from 'react'
import { bonusValueLabelsApi, type BonusValueLabel, type BonusValueLabelKind } from '../../api/bonusValueLabels'
import { useDialog } from '../../contexts/DialogContext'
import { compareJa } from '../../utils/collator'

interface Row {
  id: number
  label: string
  // 入力中の編集値（label と異なれば未保存）
  draft: string
}

const toRow = (b: BonusValueLabel): Row => ({ id: b.id, label: b.label, draft: b.label })

// タブ（項目名の種別）ごとの表示文言。effectLabel は統合の説明文で使う効果名。
const KIND_TABS: { kind: BonusValueLabelKind; title: string; usage: string; effectLabel: string }[] = [
  {
    kind: 'bonus',
    title: '付加効果の項目名',
    usage: 'ここで登録した項目名が、アイテム登録の「付加効果 → 項目名」の入力候補と、一覧の絞り込み候補に表示されます。',
    effectLabel: '付加効果',
  },
  {
    kind: 'stat',
    title: '追加効果の項目名',
    usage: 'ここで登録した項目名が、アイテム登録の「追加効果 → その他 → 項目名」の入力候補に表示されます。',
    effectLabel: '追加効果',
  },
]

/** 1種別分の2ペイン（整理済み/未整理）管理。タブ切替時は key={kind} で作り直す。 */
function LabelsPane({ kind, usage, effectLabel }: { kind: BonusValueLabelKind; usage: string; effectLabel: string }) {
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

  // 統合モーダル: 統合元（未整理の項目）。null なら非表示。
  const [mergeSource, setMergeSource] = useState<Row | null>(null)
  const [merging, setMerging] = useState(false)

  const load = () => {
    setLoading(true)
    bonusValueLabelsApi
      .adminList(kind)
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
  useEffect(load, [kind])

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
      const res = await bonusValueLabelsApi.create(label, kind)
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

  // 未整理の項目(mergeSource)を整理済みの項目(target)へ統合する。
  // 統合元を使用しているアイテム側も更新され、統合元は削除される。
  const openMerge = async (row: Row) => {
    if (organized.length === 0) {
      await alert('統合先にできる整理済みの項目がありません。先に統合先の項目を整理済みへ移動してください。', { title: '統合できません' })
      return
    }
    setMergeSource(row)
  }

  const mergeInto = async (target: Row) => {
    const source = mergeSource
    if (!source || merging) return
    const ok = await confirm(
      `「${source.label}」を「${target.label}」に統合しますか？\n` +
      `「${source.label}」を使用しているアイテムの${effectLabel}は「${target.label}」に更新され、「${source.label}」は削除されます。`,
      { title: '項目名の統合', confirmLabel: '統合', danger: true },
    )
    if (!ok) return
    setMerging(true)
    try {
      const res = await bonusValueLabelsApi.merge(source.id, target.id)
      setUnorganized((p) => p.filter((r) => r.id !== source.id))
      setMergeSource(null)
      await alert(
        `「${source.label}」を「${target.label}」に統合しました（アイテム${res.data.updated_count}件を更新）。`,
        { title: '統合しました' },
      )
    } catch {
      await alert('統合に失敗しました。', { title: 'エラー' })
    } finally {
      setMerging(false)
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
      await bonusValueLabelsApi.organize(organizedIds, kind)
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

  // withMerge: 未整理（右ペイン）のカードにだけ「統合」操作を出す
  const renderCard = (row: Row, withMerge = false) => (
    <div
      key={row.id}
      className={`flex items-center gap-2 bg-surface-card border rounded-lg px-2 py-1.5 transition-colors ${
        dragId === row.id ? 'border-primary-500 opacity-50' : 'border-surface-border'
      }`}
    >
      {/* ハンドルだけを draggable にする。カード全体を draggable にすると内包する
          <input> の編集が不安定になり、ブラウザによってはドラッグ自体が始まらないため。 */}
      <span
        draggable
        onDragStart={onCardDragStart(row.id)}
        onDragEnd={clearDrag}
        title="ドラッグして移動"
        className="cursor-grab active:cursor-grabbing select-none text-gray-500 hover:text-gray-300 text-lg leading-none px-1"
      >
        ⠿
      </span>
      <input
        type="text"
        value={row.draft}
        onChange={(e) => setDraft(row.id, e.target.value)}
        className="flex-1 min-w-0 bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
      />
      <button
        onClick={() => save(row)}
        disabled={savingId === row.id || row.draft.trim() === row.label || !row.draft.trim()}
        className="text-xs bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-3 py-1.5 rounded transition-colors"
      >
        {savingId === row.id ? '保存中' : '保存'}
      </button>
      {withMerge && (
        <button
          onClick={() => openMerge(row)}
          title="整理済みの項目名へ統合（使用しているアイテムも更新）"
          className="text-xs bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/40 text-amber-300 px-3 py-1.5 rounded transition-colors"
        >
          統合
        </button>
      )}
      <button
        onClick={() => remove(row)}
        className="text-xs bg-red-900/40 hover:bg-red-900/70 text-red-300 px-3 py-1.5 rounded transition-colors"
      >
        削除
      </button>
    </div>
  )

  return (
    <>
      <p className="text-sm text-gray-400 mb-5">
        {usage}
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
              className={`h-[calc(100vh-19rem)] min-h-[8rem] overflow-y-auto rounded-lg border border-dashed p-2 transition-colors ${
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
              className={`h-[calc(100vh-19rem)] min-h-[8rem] overflow-y-auto rounded-lg border border-dashed p-2 transition-colors ${
                dragId !== null && overRight ? 'border-primary-500/60 bg-primary-500/5' : 'border-surface-border'
              }`}
            >
              {unorganized.length === 0 ? (
                <p className="text-center text-xs text-gray-600 py-8">未整理の項目はありません。</p>
              ) : (
                <div className="space-y-1.5">
                  {unorganized.map((row) => renderCard(row, true))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* 統合先の選択モーダル（整理済みの項目から選ぶ） */}
      {mergeSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !merging && setMergeSource(null)}
        >
          <div
            data-testid="merge-modal"
            role="dialog"
            aria-label="項目名の統合"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-surface-card border border-surface-border rounded-lg p-5"
          >
            <h3 className="text-sm font-bold text-white mb-1">「{mergeSource.label}」の統合先を選択</h3>
            <p className="text-xs text-gray-400 mb-3">
              整理済みの項目名から統合先を選んでください。
              「{mergeSource.label}」を使用しているアイテムの{effectLabel}は統合先の項目名に更新され、
              「{mergeSource.label}」は削除されます。
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1 mb-4">
              {organized.map((row) => (
                <button
                  key={row.id}
                  onClick={() => mergeInto(row)}
                  disabled={merging}
                  className="w-full text-left text-sm text-white bg-surface border border-surface-border hover:border-primary-500 disabled:opacity-50 rounded px-3 py-1.5 transition-colors"
                >
                  {row.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setMergeSource(null)}
                disabled={merging}
                className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function BonusValueLabelsAdminPage() {
  const [kind, setKind] = useState<BonusValueLabelKind>('bonus')
  const active = KIND_TABS.find((t) => t.kind === kind) ?? KIND_TABS[0]

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-3">項目名の管理</h1>

      {/* 種別タブ（付加効果 / 追加効果） */}
      <div className="flex gap-1 border-b border-surface-border mb-4" role="tablist">
        {KIND_TABS.map((t) => (
          <button
            key={t.kind}
            role="tab"
            aria-selected={kind === t.kind}
            onClick={() => setKind(t.kind)}
            className={`px-4 py-2 text-sm rounded-t-md border border-b-0 transition-colors ${
              kind === t.kind
                ? 'bg-surface-card border-surface-border text-white font-semibold'
                : 'bg-transparent border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.title}
          </button>
        ))}
      </div>

      {/* タブ切替時は key で作り直してドラッグ・編集状態をリセットする */}
      <LabelsPane key={active.kind} kind={active.kind} usage={active.usage} effectLabel={active.effectLabel} />
    </div>
  )
}
