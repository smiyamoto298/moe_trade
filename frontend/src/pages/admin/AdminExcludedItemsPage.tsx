import { useEffect, useMemo, useState } from 'react'
import { excludedItemsApi } from '../../api/excludedItems'
import { compareJa } from '../../utils/collator'
import { useDialog } from '../../contexts/DialogContext'
import { usePageMeta } from '../../hooks/usePageMeta'
import type { ExcludedItem, ExclusionType, UserExclusionSuggestion } from '../../types'

/**
 * 共通の除外アイテム管理（admin）。
 * ここに登録したアイテム名は、所持アイテム管理・一括出品の貼り付けで除外される。
 * 判定はアイテム名（文字列）単位。改行区切りでまとめて追加できる。
 */
export default function AdminExcludedItemsPage() {
  usePageMeta('除外アイテム管理', '貼り付け時に除外する共通アイテム名を管理します。')
  const { confirm, alert } = useDialog()
  const [rows, setRows] = useState<ExcludedItem[]>([])
  const [types, setTypes] = useState<ExclusionType[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  // 新規追加時に割り当てる種別（未選択は既定種別「その他」）
  const [addTypeId, setAddTypeId] = useState<number | ''>('')
  const [adding, setAdding] = useState(false)
  // 種別管理
  const [newTypeName, setNewTypeName] = useState('')
  const [addingType, setAddingType] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  // 共通除外リストの表示を絞り込む種別タブ（'all' は全種別）
  const [activeTypeId, setActiveTypeId] = useState<number | 'all'>('all')
  // ユーザー個別除外（DB保存分）の集計候補
  const [suggestions, setSuggestions] = useState<UserExclusionSuggestion[]>([])
  const [promotingName, setPromotingName] = useState<string | null>(null)
  const [dismissingName, setDismissingName] = useState<string | null>(null)
  // 候補を共通除外へ昇格するときに割り当てる種別（未選択は既定種別「その他」）
  const [promoteTypeId, setPromoteTypeId] = useState<number | ''>('')

  const loadSuggestions = () => {
    excludedItemsApi.userSuggestions()
      .then((r) => setSuggestions(r.data))
      .catch(() => setSuggestions([]))
  }

  const loadTypes = () => {
    excludedItemsApi.typeList()
      .then((r) => setTypes(r.data))
      .catch(() => setTypes([]))
  }

  const load = () => {
    setLoading(true)
    excludedItemsApi.adminList()
      .then((r) => setRows(r.data))
      .finally(() => setLoading(false))
    loadTypes()
    loadSuggestions()
  }
  useEffect(load, [])

  // 選択中のタブの種別が削除されたら「すべて」へ戻す
  useEffect(() => {
    if (activeTypeId !== 'all' && types.length > 0 && !types.some((t) => t.id === activeTypeId)) {
      setActiveTypeId('all')
    }
  }, [types, activeTypeId])

  // 既定種別（その他）
  const defaultType = types.find((t) => t.is_default) ?? null

  // ---- 種別管理 ----
  const addType = async () => {
    const name = newTypeName.trim()
    if (!name) return
    setAddingType(true)
    try {
      const res = await excludedItemsApi.createType(name)
      setTypes((p) => [...p, res.data])
      setNewTypeName('')
    } catch {
      await alert('種別の追加に失敗しました（同名が既にある可能性があります）。', { title: 'エラー' })
    } finally {
      setAddingType(false)
    }
  }

  const renameType = async (t: ExclusionType) => {
    const name = window.prompt('種別名', t.name)?.trim()
    if (!name || name === t.name) return
    try {
      const res = await excludedItemsApi.updateType(t.id, { name })
      setTypes((p) => p.map((x) => (x.id === t.id ? res.data : x)))
    } catch {
      await alert('種別の改名に失敗しました（同名が既にある可能性があります）。', { title: 'エラー' })
    }
  }

  // 種別のデフォルトON/OFF（未設定ユーザーに既定で適用するか）を切り替える
  const toggleDefaultEnabled = async (t: ExclusionType) => {
    try {
      const res = await excludedItemsApi.updateType(t.id, { default_enabled: !t.default_enabled })
      setTypes((p) => p.map((x) => (x.id === t.id ? res.data : x)))
    } catch {
      await alert('デフォルトON/OFFの変更に失敗しました。', { title: 'エラー' })
    }
  }

  const removeType = async (t: ExclusionType) => {
    if (t.is_default) return
    const cnt = rows.filter((r) => r.exclusion_type_id === t.id).length
    if (!(await confirm(
      `種別「${t.name}」を削除しますか？${cnt > 0 ? `この種別の除外アイテム${cnt}件は「${defaultType?.name ?? 'その他'}」へ移動します。` : ''}`,
      { title: '種別の削除', confirmLabel: '削除', danger: true }
    ))) return
    try {
      await excludedItemsApi.removeType(t.id)
      setTypes((p) => p.filter((x) => x.id !== t.id))
      // 削除した種別の行は既定種別へ付け替わるので一覧を読み直す
      load()
    } catch {
      await alert('種別の削除に失敗しました。', { title: 'エラー' })
    }
  }

  // 除外アイテムの種別を変更
  const changeItemType = async (row: ExcludedItem, typeId: number) => {
    try {
      const res = await excludedItemsApi.update(row.id, { exclusion_type_id: typeId })
      setRows((p) => p.map((r) => (r.id === row.id ? res.data : r)))
    } catch {
      await alert('種別の変更に失敗しました。', { title: 'エラー' })
    }
  }

  // ユーザー個別除外の候補から共通除外へ追加（昇格）。追加先の種別を引数で指定（null は既定「その他」）。
  const promote = async (names: string[], typeId: number | null) => {
    if (names.length === 0) return
    setPromotingName(names.length === 1 ? names[0] : '__bulk__')
    setMessage('')
    try {
      const res = await excludedItemsApi.create(names, typeId)
      const intoName = typeId === null ? (defaultType?.name ?? 'その他') : (types.find((t) => t.id === typeId)?.name ?? '')
      setMessage(`${res.data.created_count}件を共通除外（${intoName}）に追加しました。${res.data.skipped_count > 0 ? `（${res.data.skipped_count}件は既存のためスキップ）` : ''}`)
      load()
    } catch {
      await alert('共通除外への追加に失敗しました。', { title: 'エラー' })
    } finally {
      setPromotingName(null)
    }
  }

  // 候補を「共通にしない」と却下（以後この名前は候補に出さない）
  const dismiss = async (name: string) => {
    if (!(await confirm(`「${name}」を共通除外の候補に出さないようにしますか？（個別除外しているユーザーには影響しません）`, { title: '候補を共通にしない', confirmLabel: '共通にしない' }))) return
    setDismissingName(name)
    setMessage('')
    try {
      await excludedItemsApi.dismissSuggestion(name)
      setSuggestions((p) => p.filter((s) => s.name !== name))
    } catch {
      await alert('候補の却下に失敗しました。', { title: 'エラー' })
    } finally {
      setDismissingName(null)
    }
  }

  const add = async () => {
    // 改行・カンマ区切りで複数名を受け付ける
    const names = input
      .split(/[\r\n,]+/)
      .map((n) => n.trim())
      .filter((n) => n !== '')
    if (names.length === 0) return
    setAdding(true)
    setMessage('')
    try {
      const res = await excludedItemsApi.create(names, addTypeId === '' ? null : addTypeId)
      setMessage(`${res.data.created_count}件を追加しました。${res.data.skipped_count > 0 ? `（${res.data.skipped_count}件は既存のためスキップ）` : ''}`)
      setInput('')
      load()
    } catch {
      await alert('追加に失敗しました。', { title: 'エラー' })
    } finally {
      setAdding(false)
    }
  }

  const remove = async (row: ExcludedItem) => {
    if (!(await confirm(`「${row.name}」を除外リストから削除しますか？`, { title: '除外アイテムの削除', confirmLabel: '削除', danger: true }))) return
    try {
      await excludedItemsApi.remove(row.id)
      setRows((p) => p.filter((r) => r.id !== row.id))
      setSelected((s) => { const n = new Set(s); n.delete(row.id); return n })
    } catch {
      await alert('削除に失敗しました。', { title: 'エラー' })
    }
  }

  // 一括削除（チェックボックスで選択した分）
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const toggleSelected = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const bulkDelete = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!(await confirm(`選択した ${ids.length} 件を除外リストから削除しますか？`, { title: '除外アイテムの一括削除', confirmLabel: '削除', danger: true }))) return
    setBulkDeleting(true)
    try {
      await excludedItemsApi.removeMany(ids)
      const del = new Set(ids)
      setRows((p) => p.filter((r) => !del.has(r.id)))
      setSelected(new Set())
    } catch {
      await alert('一括削除に失敗しました。', { title: 'エラー' })
    } finally {
      setBulkDeleting(false)
    }
  }

  // 行の実効種別ID（exclusion_type_id が null の行は既定種別とみなす）
  const rowTypeId = (r: ExcludedItem) => r.exclusion_type_id ?? defaultType?.id ?? null

  // 種別タブごとの件数（'all' は全件）
  const typeCounts = useMemo(() => {
    const m = new Map<number | 'all', number>()
    m.set('all', rows.length)
    for (const r of rows) {
      const id = rowTypeId(r)
      if (id != null) m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }, [rows, defaultType])

  // 共通除外リストは 種別タブ＋検索で絞り、あいうえお順（日本語ロケール）で表示する
  const filtered = useMemo(() => {
    let list = activeTypeId === 'all' ? rows : rows.filter((r) => rowTypeId(r) === activeTypeId)
    if (search.trim()) list = list.filter((r) => r.name.includes(search.trim()))
    return [...list].sort((a, b) => compareJa(a.name, b.name))
  }, [rows, search, activeTypeId, defaultType])

  // 表示中の行がすべて選択されているか
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))
  const toggleSelectAll = () =>
    setSelected((s) => {
      const n = new Set(s)
      if (allFilteredSelected) filtered.forEach((r) => n.delete(r.id))
      else filtered.forEach((r) => n.add(r.id))
      return n
    })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-2">除外アイテム管理</h1>
      <p className="text-sm text-gray-400 mb-5">
        ここに登録したアイテム名は、所持アイテム管理・一括出品でアイテムボックスを貼り付けたときに自動で除外されます
        （アイテム名の完全一致で判定）。改行・カンマ区切りでまとめて追加できます。
      </p>

      {/* 新規追加（複数可） */}
      <div className="space-y-2 mb-5">
        <textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={'除外したいアイテム名を入力（改行で複数可）\n例:\nゴミ\n木の枝'}
          className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-400">
            種別
            <select
              value={addTypeId}
              onChange={(e) => setAddTypeId(e.target.value === '' ? '' : Number(e.target.value))}
              className="bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
            >
              <option value="">{defaultType ? `${defaultType.name}（既定）` : '既定'}</option>
              {types.filter((t) => !t.is_default).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <button
            onClick={add}
            disabled={adding || !input.trim()}
            className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-2 rounded-md transition-colors whitespace-nowrap"
          >
            {adding ? '追加中...' : '+ 追加'}
          </button>
          {message && <span className="text-xs text-emerald-400">{message}</span>}
        </div>
      </div>

      {/* 種別（カテゴリ）管理 */}
      <div className="mb-6 bg-surface-card border border-surface-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">種別（カテゴリ）の管理</h2>
        <p className="text-xs text-gray-400 mb-3">
          共通除外を種別で分類できます。ユーザーはマイペ整理で適用する種別を選べます。
          各種別の「既定ON/OFF」は、まだ設定をいじっていないユーザーにその種別を最初から適用するかどうかです
          （ユーザーは個別に上書きできます）。
          「{defaultType?.name ?? 'その他'}」は既定種別で削除できません（種別を削除すると、その種別の除外アイテムは既定種別へ移動します）。
          ※「{defaultType?.name ?? 'その他'}」はアイテムごとに適用するため既定ON/OFFの対象外です。
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addType() }}
            placeholder="新しい種別名"
            className="flex-1 sm:flex-none sm:w-56 bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={addType}
            disabled={addingType || !newTypeName.trim()}
            className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors whitespace-nowrap"
          >
            {addingType ? '追加中...' : '+ 種別を追加'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => {
            const cnt = rows.filter((r) => r.exclusion_type_id === t.id).length
            return (
              <span key={t.id} className="flex items-center gap-2 text-xs bg-surface border border-surface-border rounded px-2.5 py-1.5 text-gray-200">
                {t.name} <span className="text-gray-500">({cnt})</span>
                {t.is_default ? (
                  <span className="text-[10px] text-gray-500 border border-surface-border rounded px-1 py-0.5">既定</span>
                ) : (
                  <>
                    <button
                      onClick={() => toggleDefaultEnabled(t)}
                      title="まだ設定をいじっていないユーザーに、この種別を既定で適用するか"
                      className={`text-[10px] rounded px-1.5 py-0.5 border transition-colors ${
                        t.default_enabled
                          ? 'border-emerald-600/50 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50'
                          : 'border-surface-border text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      既定{t.default_enabled ? 'ON' : 'OFF'}
                    </button>
                    <button onClick={() => renameType(t)} className="text-gray-400 hover:text-white">改名</button>
                    <button onClick={() => removeType(t)} className="text-red-400 hover:text-red-300">削除</button>
                  </>
                )}
              </span>
            )
          })}
        </div>
      </div>

      {/* ユーザーが個別に除外しているアイテム（共通除外への追加候補） */}
      {suggestions.length > 0 && (
        <div className="mb-6 bg-surface-card border border-sky-700/40 rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h2 className="text-sm font-semibold text-sky-200">ユーザーが個別に除外しているアイテム</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                利用者が自分の除外リストに登録した名前です（多い順）。共通除外へ追加できます。
                <span className="text-gray-500">（DB保存のユーザーは除外人数を集計。端末保存のユーザー分は匿名で名前のみ＝「端末」表示。共通除外に登録済みの名前は表示されません）</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                一括追加先の種別
                <select
                  value={promoteTypeId}
                  onChange={(e) => setPromoteTypeId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">{defaultType ? `${defaultType.name}（既定）` : '既定'}</option>
                  {types.filter((t) => !t.is_default).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => promote(suggestions.map((s) => s.name), promoteTypeId === '' ? null : promoteTypeId)}
                disabled={promotingName !== null}
                className="text-xs bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors whitespace-nowrap"
              >
                {promotingName === '__bulk__' ? '追加中...' : `表示中をすべて追加 (${suggestions.length})`}
              </button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {suggestions.map((s) => (
              <div key={s.name} className="flex items-center gap-2 bg-surface border border-surface-border rounded px-3 py-2">
                <span className="flex-1 text-sm text-white truncate">{s.name}</span>
                {s.user_count > 0 && (
                  <span className="text-xs text-gray-400 shrink-0" title="このアイテムを個別除外しているDB保存ユーザー数">{s.user_count}人</span>
                )}
                {s.from_device && (
                  <span className="text-[10px] text-gray-300 bg-surface border border-surface-border rounded px-1.5 py-0.5 shrink-0" title="端末（ローカル）保存ユーザーが除外（匿名・人数は不明）">端末</span>
                )}
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '') return
                    promote([s.name], v === 'default' ? null : Number(v))
                  }}
                  disabled={promotingName !== null || dismissingName !== null}
                  title="選んだ種別で共通除外へ追加"
                  className="text-xs bg-sky-900/40 hover:bg-sky-900/70 disabled:opacity-50 border border-sky-700/50 text-sky-300 px-3 py-1.5 rounded transition-colors shrink-0 focus:outline-none focus:border-sky-500"
                >
                  <option value="">{promotingName === s.name ? '追加中...' : '共通へ追加…'}</option>
                  <option value="default">{defaultType ? `${defaultType.name}（既定）` : '既定'}</option>
                  {types.filter((t) => !t.is_default).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => dismiss(s.name)}
                  disabled={promotingName !== null || dismissingName !== null}
                  title="以後この名前を共通除外の候補に出さない"
                  className="text-xs bg-surface hover:bg-surface-border disabled:opacity-50 border border-surface-border text-gray-400 px-3 py-1.5 rounded transition-colors shrink-0"
                >
                  {dismissingName === s.name ? '却下中...' : '共通にしない'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 種別タブ＋検索 */}
      <h2 className="text-sm font-semibold text-gray-300 mb-2">共通除外リスト</h2>
      <div className="flex flex-wrap gap-1.5 mb-3 border-b border-surface-border pb-2">
        <button
          onClick={() => setActiveTypeId('all')}
          className={`text-xs px-3 py-1.5 rounded-t border-b-2 transition-colors ${
            activeTypeId === 'all'
              ? 'border-primary-500 text-white font-semibold'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          すべて <span className="text-gray-500">({typeCounts.get('all') ?? 0})</span>
        </button>
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTypeId(t.id)}
            className={`text-xs px-3 py-1.5 rounded-t border-b-2 transition-colors ${
              activeTypeId === t.id
                ? 'border-primary-500 text-white font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.name} <span className="text-gray-500">({typeCounts.get(t.id) ?? 0})</span>
          </button>
        ))}
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="登録済みを絞り込み"
        className="w-full sm:w-64 bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 mb-3"
      />

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg text-sm text-gray-500">
          {rows.length === 0 ? '除外アイテムはありません。上のフォームから追加できます。' : '該当する除外アイテムがありません。'}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs text-gray-500">登録 {rows.length} 件{(activeTypeId !== 'all' || search.trim()) && `（表示 ${filtered.length} 件）`}・あいうえお順</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  className="accent-primary-500"
                />
                全選択
              </label>
              <button
                onClick={bulkDelete}
                disabled={selected.size === 0 || bulkDeleting}
                className="text-xs bg-red-900/40 hover:bg-red-900/70 disabled:opacity-40 border border-red-700/40 text-red-300 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
              >
                {bulkDeleting ? '削除中...' : `選択を削除 (${selected.size})`}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {filtered.map((row) => (
              <label
                key={row.id}
                className={`flex items-center gap-2.5 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  selected.has(row.id) ? 'border-primary-500/60 bg-primary-500/10' : 'bg-surface-card border-surface-border hover:border-gray-500'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggleSelected(row.id)}
                  className="accent-primary-500 shrink-0"
                />
                <span className="flex-1 text-sm text-white truncate">{row.name}</span>
                <select
                  value={row.exclusion_type_id ?? (defaultType?.id ?? '')}
                  onClick={(e) => e.preventDefault()}
                  onChange={(e) => { e.preventDefault(); changeItemType(row, Number(e.target.value)) }}
                  title="種別"
                  className="text-xs bg-surface border border-surface-border rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-primary-500 shrink-0"
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={(e) => { e.preventDefault(); remove(row) }}
                  className="text-xs bg-red-900/40 hover:bg-red-900/70 text-red-300 px-3 py-1.5 rounded transition-colors shrink-0"
                >
                  削除
                </button>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
