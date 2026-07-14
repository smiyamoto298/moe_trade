import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { itemsApi } from '../../api/items'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import Spinner from '../../components/Spinner'
import type { Item, ItemCategory, ItemHashtag } from '../../types'
import { SERVERS } from '../../types'
import { SPECIAL_CONDITIONS, MASTERY_BY_CODE } from '../../utils/constants'
import { BaseStatBadges, BonusEffectList, OtherInfoCell, PartNamesLabel, SetBaseStatsCell, SetBonusCell, SetSpecialConditionsCell } from '../../components/equipmentCells'
import InlineHashtags from '../../components/InlineHashtags'
import OfficialDbLink from '../../components/OfficialDbLink'
import { applyCopyRename, emptyCopyRename, type CopyRename } from '../../utils/copyRename'

type Filter = 'all' | 'unverified' | 'verified'
type Mode = 'equipment' | 'skill' | 'asset' | 'other'
// 並び替え: あいうえお順（名前・既定）/ 新着順（作成日時の新しい順）/ 更新順（更新日時の新しい順）
type Sort = 'name' | 'newest' | 'updated'

// 行操作のアイコンボタン（相場登録・編集・コピー・削除）。title と aria-label にラベルを設定する。
function ActionIconButton({ label, onClick, disabled, className, children }: {
  label: string
  onClick: () => void
  disabled?: boolean
  className: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded border transition-colors disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

// 必要マスタリのバッジ群。マスタリ名【コード】と、条件になっている構成スキルを並べて表示する。
function MasteryBadges({ codes }: { codes: string[] | null | undefined }) {
  if (!codes || codes.length === 0) return <span className="text-xs text-gray-600">—</span>
  return (
    <div className="flex flex-col gap-1.5">
      {codes.length > 1 && (
        <span className="text-[10px] text-purple-300/80">いずれかで発動（OR）</span>
      )}
      {codes.map((code) => {
        const m = MASTERY_BY_CODE[code]
        return (
          <div key={code} className="flex flex-col gap-0.5">
            <span className="text-xs text-purple-200 bg-purple-900/30 border border-purple-700/40 rounded px-1.5 py-0.5 self-start">
              {m ? `${m.name}【${code}】` : code}
            </span>
            {m && (
              <span className="flex flex-wrap gap-0.5">
                {m.skills.map((s) => (
                  <span key={s} className="text-[10px] leading-tight bg-surface border border-surface-border text-gray-400 rounded px-1 py-px">
                    {s}
                  </span>
                ))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AdminItemsPage() {
  const { user } = useAuth()
  const { unverifiedEquipmentCount, unverifiedTechniqueCount, unverifiedAssetCount, unverifiedOtherCount } = useNotification()
  const navigate = useNavigate()
  const location = useLocation()
  // 編集ページから戻ったときは、編集していたアイテムの種別タブ・フィルタを復元する
  const navState = location.state as { mode?: Mode; filter?: Filter } | null
  const initialMode = navState?.mode ?? 'equipment'
  const initialFilter = navState?.filter ?? 'all'
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [mode, setMode] = useState<Mode>(initialMode)
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [search, setSearch] = useState('')
  // 並び替え（クライアント側で適用。既定はあいうえお順＝名前順でAPIの返却順と一致）
  const [sort, setSort] = useState<Sort>('name')
  // ハッシュタグでの絞り込み（チップのクリックで設定。クライアント側で適用）
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  // 装備セットを展開表示（装備品タブのみ）。
  // チェックなし: セット本体のみ表示し構成部位は隠す / チェックあり: 構成部位を表示しセット本体は隠す
  const [expandSets, setExpandSets] = useState(false)
  // 取引情報（出品数・買取数）を各行に表示するか（デフォルト表示）
  const [showTrade, setShowTrade] = useState(true)
  const [loading, setLoading] = useState(true)
  const [mastersLoading, setMastersLoading] = useState(true)

  const isAdmin = user?.role === 'admin'
  // editor 以上（editor / admin）。確認済みへの変更・全アイテム編集が可能。
  const isEditor = user?.role === 'editor' || user?.role === 'admin'
  const isLoggedIn = !!user
  // 一般 user が編集できるのは「自分が登録した確認中アイテム」かつ「staff 未編集（排他制御）」のみ。
  const canEditItem = (item: Item) =>
    isEditor || (!!user && item.submitted_by === user.id && item.verified_status === 'unverified' && !item.locked_by_staff)
  const isSkillMode = mode === 'skill'
  const isAssetMode = mode === 'asset'
  const isOtherMode = mode === 'other'
  const [actioningId, setActioningId] = useState<number | null>(null)

  // 削除確認モーダル
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)
  // 関連データありで確認が必要な場合の警告メッセージ（null の間は通常の削除確認）
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // 「他のアイテムに付け替える」モード（重複アイテムの統合）
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeKeyword, setMergeKeyword] = useState('')
  const [mergeResults, setMergeResults] = useState<Item[]>([])
  const [mergeSearching, setMergeSearching] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<Item | null>(null)
  const [merging, setMerging] = useState(false)

  // コピーして編集モーダル（アイテム名の置換・末尾追加を入力してから編集画面へ遷移する）
  const [copyTarget, setCopyTarget] = useState<Item | null>(null)
  const [copyRename, setCopyRename] = useState<CopyRename>(emptyCopyRename())

  // 相場登録モーダル
  const [marketTarget, setMarketTarget] = useState<Item | null>(null)
  const [marketForm, setMarketForm] = useState({ price: '', server: SERVERS[0] as string, traded_at: '', note: '' })
  const [marketSaving, setMarketSaving] = useState(false)
  const [marketError, setMarketError] = useState('')
  const [marketDone, setMarketDone] = useState('')

  // トップカテゴリ名 → 配下カテゴリIDセット（トップ自身も含む）
  const idsForTop = (name: string) => {
    const parent = categories.find((c) => c.parent_id === null && c.name === name)
    if (!parent) return new Set<number>()
    const ids = new Set<number>([parent.id])
    ;(parent.children ?? []).forEach((c) => ids.add(c.id))
    return ids
  }
  const skillCategoryIds = idsForTop('テクニック')
  const assetCategoryIds = idsForTop('アセット')
  const otherCategoryIds = idsForTop('その他')

  // 装備セットの構成部位（piece）として登録されているアイテムのID集合
  const setMemberIds = new Set<number>()
  for (const it of items) {
    if (it.is_equipment_set) (it.set_members ?? []).forEach((m) => setMemberIds.add(m.id))
  }

  // アイテムが種別タブ m に属するか（装備品は既定表示＝セット本体のみに合わせ、構成部位を除く）
  const inMode = (i: Item, m: Mode) =>
    m === 'skill' ? skillCategoryIds.has(i.category.id)
      : m === 'asset' ? assetCategoryIds.has(i.category.id)
      : m === 'other' ? otherCategoryIds.has(i.category.id)
      : !skillCategoryIds.has(i.category.id) && !assetCategoryIds.has(i.category.id)
        && !otherCategoryIds.has(i.category.id) && !setMemberIds.has(i.id)

  // 種別タブ m に確認中アイテムがあるか
  const hasUnverifiedIn = (m: Mode) =>
    items.some((i) => i.verified_status === 'unverified' && inMode(i, m))

  // 種別タブの切替。フィルタは「すべて」へ戻すが、管理者は切替先タブに確認中が
  // あれば「確認中」を既定にする（確認待ちをタブ横断で処理しやすくする）
  const selectMode = (m: Mode) => {
    setMode(m)
    setFilter(isAdmin && hasUnverifiedIn(m) ? 'unverified' : 'all')
  }

  const fetchItems = () => {
    setLoading(true)
    itemsApi.list({ name: search || undefined })
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false))
  }

  // ハッシュタグ編集後に該当アイテムの hashtags をローカル更新する
  const updateItemHashtags = (itemId: number, hashtags: ItemHashtag[]) =>
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, hashtags } : i)))

  useEffect(() => {
    setMastersLoading(true)
    itemsApi.categories()
      .then((r) => setCategories(r.data))
      .finally(() => setMastersLoading(false))
  }, [])

  useEffect(() => { fetchItems() }, [search])

  // 管理者の初期表示: 確認中アイテムがあれば、確認待ちをすぐ処理できるよう
  // 既定でフィルタを「確認中」・並び替えを「更新順」にする。現在の種別タブに
  // 確認中が無ければ、確認中のある最初のタブへ切り替える。
  // 初回ロード（アイテム＋カテゴリ）完了時に一度だけ適用し、編集ページから
  // 戻ったとき（navState でタブ・フィルタを復元する場合）は適用しない。
  const unverifiedDefaultApplied = useRef(false)
  useEffect(() => {
    if (unverifiedDefaultApplied.current || loading || mastersLoading) return
    unverifiedDefaultApplied.current = true
    if (!isAdmin || navState) return
    if (!items.some((i) => i.verified_status === 'unverified')) return
    if (!hasUnverifiedIn(mode)) {
      const target = (['equipment', 'skill', 'asset', 'other'] as Mode[]).find(hasUnverifiedIn)
      if (target) setMode(target)
    }
    setFilter('unverified')
    setSort('updated')
    // 初回ロード完了時に一度だけ適用する（items やカテゴリID集合は閉包から参照する）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, mastersLoading])

  const handleVerify = async (id: number) => {
    if (actioningId) return
    setActioningId(id)
    try {
      await itemsApi.verify(id)
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, verified_status: 'verified' } : i))
    } finally {
      setActioningId(null)
    }
  }

  const openDelete = (item: Item) => {
    if (actioningId || deleting) return
    setDeleteTarget(item)
    setDeleteWarning(null)
    setDeleteError('')
  }

  const closeDelete = () => {
    if (deleting || merging) return
    setDeleteTarget(null)
    setDeleteWarning(null)
    setDeleteError('')
    setMergeMode(false)
    setMergeKeyword('')
    setMergeResults([])
    setMergeTarget(null)
  }

  // 「他のアイテムに付け替える」モードを開始。元アイテム名で候補を初期検索する。
  const startMerge = () => {
    setMergeMode(true)
    setMergeTarget(null)
    setDeleteError('')
    setMergeKeyword('')
  }

  // 付け替え先候補の検索（元アイテム自身は除外）
  const searchMergeTargets = (keyword: string) => {
    setMergeKeyword(keyword)
    setMergeTarget(null)
    const q = keyword.trim()
    if (!q) { setMergeResults([]); return }
    setMergeSearching(true)
    itemsApi.list({ name: q })
      .then((r) => setMergeResults(r.data.filter((i) => i.id !== deleteTarget?.id).slice(0, 30)))
      .finally(() => setMergeSearching(false))
  }

  // 統合の実行：source の関連データを target へ付け替え、source を削除する
  const confirmMerge = async () => {
    if (!deleteTarget || !mergeTarget || merging) return
    setMerging(true)
    setDeleteError('')
    try {
      await itemsApi.merge(deleteTarget.id, mergeTarget.id)
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id))
      closeDelete()
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } })?.response
      setDeleteError(res?.data?.message ?? 'アイテムの付け替えに失敗しました。')
    } finally {
      setMerging(false)
    }
  }

  // モーダルの削除ボタン。関連データがあれば 1 回目は確認警告を表示し、2 回目（force）で削除する。
  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return
    const force = deleteWarning !== null
    setDeleting(true)
    setDeleteError('')
    try {
      await itemsApi.delete(deleteTarget.id, force)
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id))
      setDeleteTarget(null)
      setDeleteWarning(null)
    } catch (err: unknown) {
      const res = (err as {
        response?: { status?: number; data?: { requires_confirmation?: boolean; message?: string } }
      })?.response
      // 関連データ（出品・取引・取引履歴）がある場合は禁止せず、確認のうえ強制削除へ
      if (res?.status === 409 && res.data?.requires_confirmation && !force) {
        setDeleteWarning(res.data.message ?? 'このアイテムには関連データが紐づいています。関連データも含めて削除しますか？')
      } else {
        setDeleteError(res?.data?.message ?? 'アイテムの削除に失敗しました。')
      }
    } finally {
      setDeleting(false)
    }
  }

  const openCopy = (item: Item) => {
    setCopyTarget(item)
    setCopyRename(emptyCopyRename())
  }

  const closeCopy = () => setCopyTarget(null)

  const setCopyReplacement = (idx: number, key: 'search' | 'replace', val: string) =>
    setCopyRename((p) => ({
      ...p,
      replacements: p.replacements.map((r, i) => i === idx ? { ...r, [key]: val } : r),
    }))

  const addCopyReplacement = () =>
    setCopyRename((p) => ({ ...p, replacements: [...p.replacements, { search: '', replace: '' }] }))

  const removeCopyReplacement = (idx: number) =>
    setCopyRename((p) => ({ ...p, replacements: p.replacements.filter((_, i) => i !== idx) }))

  // 名前変更の入力内容を state で渡し、コピー編集画面側でフォームへ適用する
  const confirmCopy = () => {
    if (!copyTarget) return
    navigate(`/admin/items/new?copy=${copyTarget.id}`, { state: { filter, copyRename } })
  }

  const openMarketPrice = (item: Item) => {
    setMarketTarget(item)
    setMarketForm({ price: '', server: SERVERS[0], traded_at: new Date().toISOString().slice(0, 10), note: '' })
    setMarketError('')
    setMarketDone('')
  }

  const closeMarketPrice = () => {
    if (marketSaving) return
    setMarketTarget(null)
  }

  const submitMarketPrice = async () => {
    if (!marketTarget || marketSaving) return
    if (!(Number(marketForm.price) >= 1)) {
      setMarketError('価格は1以上で入力してください。')
      return
    }
    if (!marketForm.traded_at) {
      setMarketError('取引日を入力してください。')
      return
    }
    setMarketError('')
    setMarketSaving(true)
    try {
      await itemsApi.createMarketPrice(marketTarget.id, {
        price: Number(marketForm.price),
        server: marketForm.server,
        traded_at: marketForm.traded_at,
        note: marketForm.note || undefined,
      })
      // 続けて登録できるよう、価格・備考だけリセットして成立メッセージを表示
      setMarketDone(`「${marketTarget.name}」の相場を登録しました。`)
      setMarketForm((p) => ({ ...p, price: '', note: '' }))
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response
      const first = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined
      setMarketError(first ?? res?.data?.message ?? '相場の登録に失敗しました。')
    } finally {
      setMarketSaving(false)
    }
  }

  // スキル/アセット/装備品モードで絞り込み
  const modeItems = items.filter((i) => {
    if (isSkillMode) return skillCategoryIds.has(i.category.id)
    if (isAssetMode) return assetCategoryIds.has(i.category.id)
    if (isOtherMode) return otherCategoryIds.has(i.category.id)
    if (skillCategoryIds.has(i.category.id) || assetCategoryIds.has(i.category.id) || otherCategoryIds.has(i.category.id)) return false
    // 装備セットの展開表示: チェックありは構成部位を表示してセット本体を隠し、
    // チェックなしはセット本体のみ表示して構成部位を隠す（セットに属さない通常アイテムは常に表示）
    return expandSets ? !i.is_equipment_set : !setMemberIds.has(i.id)
  })

  const filtered = modeItems.filter((i) => {
    if (filter === 'unverified' && i.verified_status !== 'unverified') return false
    if (filter === 'verified' && i.verified_status !== 'verified') return false
    // ハッシュタグ絞り込み（タグ名・大文字小文字を無視）
    if (tagFilter && !(i.hashtags ?? []).some((h) => h.tag.toLowerCase() === tagFilter.toLowerCase())) return false
    return true
  })

  // 並び替え（あいうえお順＝名前順 / 新着順＝作成日時の新しい順 / 更新順＝更新日時の新しい順）。
  // 日時が欠落している場合は id の降順をフォールバックにする（新しいアイテムほど id が大きい）。
  const byDateDesc = (key: 'created_at' | 'updated_at') => (a: Item, b: Item) => {
    const av = a[key] ? Date.parse(a[key]!) : NaN
    const bv = b[key] ? Date.parse(b[key]!) : NaN
    if (!Number.isNaN(av) && !Number.isNaN(bv) && av !== bv) return bv - av
    return b.id - a.id
  }
  const sorted = [...filtered].sort(
    sort === 'newest'
      ? byDateDesc('created_at')
      : sort === 'updated'
      ? byDateDesc('updated_at')
      : (a, b) => a.name.localeCompare(b.name, 'ja'),
  )

  const unverifiedCount = modeItems.filter((i) => i.verified_status === 'unverified').length

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">アイテム管理</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {user?.role === 'admin'
                ? '管理者権限'
                : user?.role === 'editor'
                ? '編集者権限'
                : user
                ? '一般ユーザー（自分が登録した確認中アイテムのみ編集可）'
                : '閲覧のみ（編集にはログインが必要です）'}
            </p>
          </div>
          <div className="flex border border-surface-border rounded-lg overflow-hidden text-xs sm:text-sm">
            <button
              onClick={() => selectMode('equipment')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 transition-colors ${mode === 'equipment' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              装備品
              {unverifiedEquipmentCount > 0 && (
                <span
                  title={`確認中アイテム ${unverifiedEquipmentCount}件`}
                  className="bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none"
                >
                  {unverifiedEquipmentCount}
                </span>
              )}
            </button>
            <button
              onClick={() => selectMode('skill')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 transition-colors ${isSkillMode ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              テクニック
              {unverifiedTechniqueCount > 0 && (
                <span
                  title={`確認中アイテム ${unverifiedTechniqueCount}件`}
                  className="bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none"
                >
                  {unverifiedTechniqueCount}
                </span>
              )}
            </button>
            <button
              onClick={() => selectMode('asset')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 transition-colors ${isAssetMode ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              アセット
              {unverifiedAssetCount > 0 && (
                <span
                  title={`確認中アイテム ${unverifiedAssetCount}件`}
                  className="bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none"
                >
                  {unverifiedAssetCount}
                </span>
              )}
            </button>
            <button
              onClick={() => selectMode('other')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 transition-colors ${isOtherMode ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              その他
              {unverifiedOtherCount > 0 && (
                <span
                  title={`確認中アイテム ${unverifiedOtherCount}件`}
                  className="bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none"
                >
                  {unverifiedOtherCount}
                </span>
              )}
            </button>
          </div>
          {/* 並び替え（あいうえお順・新着順・更新順。クライアント側で適用） */}
          <select
            aria-label="並び替え"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="bg-surface border border-surface-border rounded px-3 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-primary-500"
          >
            <option value="name">あいうえお順</option>
            <option value="newest">新着順</option>
            <option value="updated">更新順</option>
          </select>
        </div>
        {isLoggedIn && (
          <Link
            to="/admin/items/new"
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm px-4 py-2 rounded-md transition-colors"
          >
            + アイテムを追加
          </Link>
        )}
      </div>

      {mastersLoading ? (
        <Spinner center />
      ) : (
      <>
      {/* フィルター・検索 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md overflow-hidden border border-surface-border">
          {(['all', 'unverified', 'verified'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                filter === f ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {f === 'all' ? `すべて (${modeItems.length})` : f === 'unverified' ? `確認中 (${unverifiedCount})` : `確認済み (${modeItems.length - unverifiedCount})`}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="アイテム名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-full sm:w-56"
        />
        {/* ハッシュタグで絞り込み（タグ名・完全一致。# は省略可） */}
        <input
          type="text"
          placeholder="#ハッシュタグで絞り込み"
          value={tagFilter ?? ''}
          onChange={(e) => setTagFilter(e.target.value.replace(/^[#＃]+/, '') || null)}
          className="bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-full sm:w-48"
        />
        {/* 装備セットを展開表示（装備品タブのみ） */}
        {!isSkillMode && !isAssetMode && !isOtherMode && (
          <label className="flex items-center gap-2 px-2 py-1.5 rounded border border-surface-border hover:border-gray-500 cursor-pointer text-xs text-gray-300 transition-colors">
            <input
              type="checkbox"
              checked={expandSets}
              onChange={(e) => setExpandSets(e.target.checked)}
              className="accent-amber-500 w-4 h-4"
            />
            <span>装備セットを展開表示</span>
          </label>
        )}
        {/* 取引情報（出品数・買取数）の表示切替 */}
        <label className="flex items-center gap-2 px-2 py-1.5 rounded border border-surface-border hover:border-gray-500 cursor-pointer text-xs text-gray-300 transition-colors">
          <input
            type="checkbox"
            checked={showTrade}
            onChange={(e) => setShowTrade(e.target.checked)}
            className="accent-sky-500 w-4 h-4"
          />
          <span>取引情報を表示</span>
        </label>
      </div>

      {/* テーブル（コンテナ幅で詳細列を畳む。狭い画面ではアイテム名セルに主要情報をまとめて表示する） */}
      <div className="resp-table-container bg-surface-card border border-surface-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">アイテム名</th>
              <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">種別</th>
              {isSkillMode ? (
                <>
                  <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={2}>必要スキル</th>
                  <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">必要マスタリ</th>
                </>
              ) : isAssetMode ? (
                <>
                  <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">設置・サイズ</th>
                  <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">ストレージ・特殊機能</th>
                  <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">特殊条件</th>
                </>
              ) : isOtherMode ? (
                <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={3}>情報</th>
              ) : (
                <>
                  <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">追加効果</th>
                  <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">付加効果</th>
                  <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">特殊条件</th>
                </>
              )}
              {showTrade && (
                <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">取引情報</th>
              )}
              <th className="resp-col-wide text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">状態</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {loading ? (
              <tr><td colSpan={showTrade ? 8 : 7} className="text-center py-10 text-gray-500">読み込み中...</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={showTrade ? 8 : 7} className="text-center py-10 text-gray-500">アイテムが見つかりません</td></tr>
            ) : (
              sorted.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-surface-border/30 transition-colors ${item.verified_status === 'unverified' ? 'bg-yellow-900/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    {/* アイテム名はテキスト表示にし、その下にアイテム恒久ページ（公開・SEOの正規ランディング先）への詳細リンクと公式DBリンクを置く */}
                    <span className="text-white font-medium">{item.name}</span>
                    <div className="mt-0.5 flex items-center gap-2 w-fit">
                      <Link
                        to={`/items/${item.id}`}
                        className="text-xs text-primary-500 hover:underline transition-colors"
                      >
                        詳細を見る
                      </Link>
                      <OfficialDbLink url={item.official_url} />
                    </div>
                    {/* 狭い画面用: 畳んだ「種別・状態・取引情報」列をアイテム名の下にまとめて表示する */}
                    <div className="resp-narrow-only mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-gray-400">{item.category.name}</span>
                      {item.verified_status === 'verified' ? (
                        <span className="text-xs text-emerald-400">✓ 確認済み</span>
                      ) : (
                        <span className="text-xs text-yellow-400">⚠ 確認中</span>
                      )}
                      {showTrade && (
                        <>
                          <span className="text-xs bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                            出品 {item.active_listing_count ?? 0}
                          </span>
                          <span className="text-xs bg-sky-900/30 border border-sky-700/40 text-sky-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                            買取 {item.active_buy_request_count ?? 0}
                          </span>
                        </>
                      )}
                    </div>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{item.description}</p>}
                    {/* 装備セットは構成部位（部位カテゴリ名チップ）をアイテム名の下に表示する */}
                    {item.is_equipment_set && (item.set_members?.length ?? 0) > 0 && (
                      <div className="mt-1">
                        <PartNamesLabel names={item.set_members!.map((m) => m.category.name)} />
                      </div>
                    )}
                    {/* ハッシュタグ（クリックでまとめて編集。ログイン時のみ） */}
                    <InlineHashtags
                      itemId={item.id}
                      hashtags={item.hashtags}
                      editable={isLoggedIn}
                      size="sm"
                      className="mt-1"
                      onSaved={(hashtags) => updateItemHashtags(item.id, hashtags)}
                    />
                  </td>
                  <td className="resp-col-wide px-4 py-3 text-gray-300">{item.category.name}</td>
                  {isSkillMode ? (
                    <>
                    <td className="resp-col-wide px-4 py-3 align-top" colSpan={2}>
                      <div className="flex flex-wrap gap-1">
                        {!item.skill_requirements || Object.keys(item.skill_requirements).length === 0 ? (
                          <span className="text-xs text-gray-600">—</span>
                        ) : Object.entries(item.skill_requirements).map(([skill, v]) => (
                          <span key={skill} className="text-xs bg-surface border border-surface-border text-gray-300 px-1.5 py-0.5 rounded">
                            {skill}: <span className="text-white font-medium">{v}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="resp-col-wide px-4 py-3 align-top">
                      <MasteryBadges codes={item.mastery_requirements} />
                    </td>
                    </>
                  ) : isAssetMode ? (
                  <>
                  <td className="resp-col-wide px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.placement && (
                        <span className="text-xs bg-surface text-gray-300 px-1.5 py-0.5 rounded">{item.placement}</span>
                      )}
                      {(item.asset_width && item.asset_height) ? (
                        <span className="text-xs bg-surface text-gray-300 px-1.5 py-0.5 rounded">{item.asset_width}×{item.asset_height}</span>
                      ) : null}
                      {!item.placement && !(item.asset_width && item.asset_height) && (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>
                  </td>
                  <td className="resp-col-wide px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(item.storage_count ?? 0) > 0 && (
                        <span className="text-xs bg-surface text-gray-300 px-1.5 py-0.5 rounded">ストレージ {item.storage_count}</span>
                      )}
                      {item.special_function && (
                        <span className="text-xs bg-primary-500/10 border border-primary-500/30 text-primary-300 px-1.5 py-0.5 rounded">{item.special_function}</span>
                      )}
                      {!(item.storage_count ?? 0) && !item.special_function && (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>
                  </td>
                  <td className="resp-col-wide px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(item.special_conditions ?? []).length === 0 ? (
                        <span className="text-xs text-gray-600">—</span>
                      ) : (item.special_conditions ?? []).map((c) => (
                        <span key={c} title={SPECIAL_CONDITIONS[c]} className="text-xs bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded border border-red-700/30">
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  </>
                  ) : isOtherMode ? (
                  <td className="resp-col-wide px-4 py-3" colSpan={3}>
                    <OtherInfoCell item={item} />
                  </td>
                  ) : (
                  <>
                  {/* 追加効果（出品一覧に合わせ、装備セットは構成部位を効果内容でまとめて表示） */}
                  <td className="resp-col-wide px-4 py-3">
                    {item.is_equipment_set ? (
                      <SetBaseStatsCell members={item.set_members ?? []} categories={categories} />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {Object.keys(item.base_stats ?? {}).length === 0 && !item.mithril ? (
                          <span className="text-xs text-gray-600">—</span>
                        ) : (
                          <BaseStatBadges item={item} />
                        )}
                      </div>
                    )}
                  </td>
                  {/* 付加効果（装備セットは構成部位の付加効果をまとめて表示） */}
                  <td className="resp-col-wide px-4 py-3">
                    {item.is_equipment_set ? (
                      <SetBonusCell members={item.set_members ?? []} categories={categories} />
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {(item.bonus_effects ?? []).length === 0 ? (
                          <span className="text-xs text-gray-600">—</span>
                        ) : (
                          <BonusEffectList item={item} />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="resp-col-wide px-4 py-3">
                    {item.is_equipment_set ? (
                      <SetSpecialConditionsCell members={item.set_members ?? []} categories={categories} />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(item.special_conditions ?? []).length === 0 ? (
                          <span className="text-xs text-gray-600">—</span>
                        ) : (item.special_conditions ?? []).map((c) => (
                          <span key={c} title={SPECIAL_CONDITIONS[c]} className="text-xs bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded border border-red-700/30">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  </>
                  )}
                  {showTrade && (
                    <td className="resp-col-wide px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span
                          title="出品数（募集中）"
                          className="text-xs bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 px-1.5 py-0.5 rounded whitespace-nowrap"
                        >
                          出品 {item.active_listing_count ?? 0}
                        </span>
                        <span
                          title="買取数（募集中）"
                          className="text-xs bg-sky-900/30 border border-sky-700/40 text-sky-300 px-1.5 py-0.5 rounded whitespace-nowrap"
                        >
                          買取 {item.active_buy_request_count ?? 0}
                        </span>
                      </div>
                    </td>
                  )}
                  <td className="resp-col-wide px-4 py-3">
                    {item.verified_status === 'verified' ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">✓ 確認済み</span>
                    ) : (
                      <span className="text-xs text-yellow-400 flex items-center gap-1">⚠ 確認中</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {/* 確認済みにする：editor / admin のみ（未確認のとき） */}
                      {isEditor && item.verified_status === 'unverified' && (
                        <button
                          onClick={() => handleVerify(item.id)}
                          disabled={actioningId === item.id}
                          className="text-xs bg-emerald-900/40 hover:bg-emerald-900/70 disabled:opacity-50 border border-emerald-700/50 text-emerald-300 px-2 py-1 rounded transition-colors"
                        >
                          {actioningId === item.id ? '処理中...' : '確認済みにする'}
                        </button>
                      )}
                      {/* 相場登録：admin のみ（確認済みのとき） */}
                      {isAdmin && item.verified_status === 'verified' && (
                        <ActionIconButton
                          label="相場登録"
                          onClick={() => openMarketPrice(item)}
                          className="bg-sky-900/40 hover:bg-sky-900/70 border-sky-700/50 text-sky-300"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 7.5l3 4.5m0 0l3-4.5M12 12v5.25M15 12H9m6 3H9m12-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </ActionIconButton>
                      )}
                      {/* 編集：staff は全件、user は自分の未確認(未ロック)のみ */}
                      {canEditItem(item) && (
                        <ActionIconButton
                          label="編集"
                          onClick={() => navigate(`/admin/items/${item.id}/edit`, { state: { filter } })}
                          className="bg-surface hover:bg-surface-border border-surface-border text-gray-300"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" />
                          </svg>
                        </ActionIconButton>
                      )}
                      {/* コピーして編集：editor 以上。名前変更ダイアログを挟んで複製した新規作成フォームを開く */}
                      {isEditor && (
                        <ActionIconButton
                          label="コピー"
                          onClick={() => openCopy(item)}
                          className="bg-amber-900/30 hover:bg-amber-900/60 border-amber-700/40 text-amber-300"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4" aria-hidden="true">
                            <rect x="9" y="9" width="11" height="11" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                          </svg>
                        </ActionIconButton>
                      )}
                      {/* 削除：admin のみ */}
                      {isAdmin && (
                        <ActionIconButton
                          label="削除"
                          onClick={() => openDelete(item)}
                          disabled={actioningId === item.id}
                          className="bg-red-900/30 hover:bg-red-900/60 border-red-700/30 text-red-400"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </ActionIconButton>
                      )}
                      {/* 操作が無いユーザー向けのプレースホルダ */}
                      {!isEditor && !canEditItem(item) && (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </>
      )}

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 !mt-0"
          onClick={closeDelete}
        >
          <div
            className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-white">
              {mergeMode ? '他のアイテムに付け替える' : 'アイテムの削除'}
            </h2>

            {mergeMode ? (
              <>
                <p className="text-sm text-gray-300">
                  「<span className="text-white font-medium">{deleteTarget.name}</span>」の出品・取引履歴・相場データを、
                  選択したアイテムに付け替えてから「{deleteTarget.name}」を削除します。
                  <span className="text-gray-400">（同じアイテムが重複登録された場合の統合用）</span>
                </p>

                <input
                  type="text"
                  autoFocus
                  value={mergeKeyword}
                  onChange={(e) => searchMergeTargets(e.target.value)}
                  placeholder="付け替え先のアイテム名で検索"
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                />

                <div className="max-h-56 overflow-y-auto border border-surface-border rounded divide-y divide-surface-border">
                  {mergeSearching ? (
                    <p className="text-sm text-gray-500 text-center py-4">検索中...</p>
                  ) : mergeKeyword.trim() === '' ? (
                    <p className="text-sm text-gray-500 text-center py-4">アイテム名を入力してください。</p>
                  ) : mergeResults.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">該当するアイテムが見つかりません。</p>
                  ) : (
                    mergeResults.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => setMergeTarget(it)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                          mergeTarget?.id === it.id ? 'bg-primary-500/20' : 'hover:bg-surface-border/40'
                        }`}
                      >
                        <span className="text-sm text-white flex-1 truncate">{it.name}</span>
                        <span className="text-[10px] text-gray-500 shrink-0">{it.category.name}</span>
                        {it.verified_status === 'unverified' && (
                          <span className="text-[10px] text-yellow-400 shrink-0">⚠ 確認中</span>
                        )}
                        {mergeTarget?.id === it.id && <span className="text-primary-400 text-xs shrink-0">✓</span>}
                      </button>
                    ))
                  )}
                </div>

                {mergeTarget && (
                  <div className="bg-sky-900/20 border border-sky-700/40 rounded px-3 py-2 text-sm text-sky-200">
                    「<span className="font-medium">{deleteTarget.name}</span>」→「<span className="font-medium">{mergeTarget.name}</span>」に付け替えて削除します。
                  </div>
                )}

                {deleteError && (
                  <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">
                    {deleteError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setMergeMode(false); setDeleteError('') }}
                    disabled={merging}
                    className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border disabled:opacity-50 transition-colors"
                  >
                    戻る
                  </button>
                  <button
                    onClick={confirmMerge}
                    disabled={!mergeTarget || merging}
                    className="text-sm bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-4 py-2 rounded font-medium transition-colors"
                  >
                    {merging ? '付け替え中...' : '付け替えて削除する'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {deleteWarning ? (
                  <div className="bg-red-900/30 border border-red-700/50 rounded px-3 py-2.5 text-sm text-red-200 whitespace-pre-line">
                    {deleteWarning}
                  </div>
                ) : (
                  <p className="text-sm text-gray-300">
                    「<span className="text-white font-medium">{deleteTarget.name}</span>」を削除しますか？
                  </p>
                )}

                {deleteError && (
                  <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">
                    {deleteError}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={closeDelete}
                    disabled={deleting}
                    className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border disabled:opacity-50 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={startMerge}
                    disabled={deleting}
                    className="text-sm bg-sky-900/40 hover:bg-sky-900/70 border border-sky-700/50 text-sky-200 px-4 py-2 rounded disabled:opacity-50 transition-colors"
                  >
                    他のアイテムに付け替える
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={deleting}
                    className="text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded font-medium transition-colors"
                  >
                    {deleting ? '削除中...' : deleteWarning ? '関連データごと削除する' : '削除する'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* コピーして編集モーダル：アイテム名の置換・末尾追加を入力してプレビューを確認してから編集画面へ */}
      {copyTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 !mt-0"
          onClick={closeCopy}
        >
          <div
            className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-bold text-white">コピーして編集</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                「<span className="text-gray-200">{copyTarget.name}</span>」を複製します。
                アイテム名の置換・末尾追加ができます（空欄のままなら名前はそのままコピーされます）。
              </p>
            </div>

            {/* 文字置換（行を追加して複数指定できる。上から順に適用） */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">文字置換（置換対象 → 置換後）</label>
                <button
                  type="button"
                  onClick={addCopyReplacement}
                  className="text-xs text-primary-500 hover:text-primary-500/80"
                >
                  + 置換を追加
                </button>
              </div>
              {copyRename.replacements.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input
                    type="text"
                    aria-label={`置換対象 ${i + 1}`}
                    value={r.search}
                    onChange={(e) => setCopyReplacement(i, 'search', e.target.value)}
                    placeholder="置換対象（例: 騎士）"
                    className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                  />
                  <input
                    type="text"
                    aria-label={`置換後 ${i + 1}`}
                    value={r.replace}
                    onChange={(e) => setCopyReplacement(i, 'replace', e.target.value)}
                    placeholder="置換後（例: 女王）"
                    className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                  />
                  {copyRename.replacements.length > 1 && (
                    <button
                      type="button"
                      aria-label={`置換を削除 ${i + 1}`}
                      onClick={() => removeCopyReplacement(i)}
                      className="text-red-400 hover:text-red-300 text-sm px-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">末尾に追加</label>
              <input
                type="text"
                aria-label="末尾に追加"
                value={copyRename.suffix}
                onChange={(e) => setCopyRename((p) => ({ ...p, suffix: e.target.value }))}
                placeholder="例: (染色可)"
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* コピー後の名前プレビュー（装備セットは各部位アイテム名にも適用される） */}
            <div className="bg-surface border border-surface-border rounded px-3 py-2 space-y-1">
              <p className="text-xs text-gray-500">コピー後の名前</p>
              <p className="text-sm text-white">{applyCopyRename(copyTarget.name, copyRename)}</p>
              {copyTarget.is_equipment_set && (copyTarget.set_members ?? []).map((m) => (
                <p key={m.id} className="text-xs text-gray-300">・{applyCopyRename(m.name, copyRename)}</p>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={closeCopy}
                className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={confirmCopy}
                className="text-sm bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded font-medium transition-colors"
              >
                コピーして編集
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 相場登録モーダル */}
      {marketTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 !mt-0"
          onClick={closeMarketPrice}
        >
          <div
            className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-bold text-white">相場を登録</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                他サイト等で取引された相場情報を登録します（「<span className="text-gray-200">{marketTarget.name}</span>」）
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">価格（AC）<span className="text-red-400">*</span></label>
                <input
                  type="number"
                  min={1}
                  value={marketForm.price}
                  onChange={(e) => setMarketForm((p) => ({ ...p, price: e.target.value }))}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">サーバー <span className="text-red-400">*</span></label>
                <select
                  value={marketForm.server}
                  onChange={(e) => setMarketForm((p) => ({ ...p, server: e.target.value }))}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                >
                  {SERVERS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">取引日 <span className="text-red-400">*</span></label>
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={marketForm.traded_at}
                onChange={(e) => setMarketForm((p) => ({ ...p, traded_at: e.target.value }))}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">メモ（任意・取引元サイト等）</label>
              <input
                type="text"
                maxLength={200}
                value={marketForm.note}
                onChange={(e) => setMarketForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="例: ○○取引掲示板"
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              />
            </div>

            {marketError && (
              <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">
                {marketError}
              </div>
            )}
            {marketDone && (
              <div className="bg-emerald-900/40 border border-emerald-600/50 rounded px-3 py-2 text-sm text-emerald-300">
                {marketDone} 続けて登録できます。
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={closeMarketPrice}
                disabled={marketSaving}
                className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border disabled:opacity-50 transition-colors"
              >
                閉じる
              </button>
              <button
                onClick={submitMarketPrice}
                disabled={marketSaving}
                className="text-sm bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-4 py-2 rounded font-medium transition-colors"
              >
                {marketSaving ? '登録中...' : '登録する'}
              </button>
            </div>          </div>
        </div>
      )}
    </div>
  )
}
