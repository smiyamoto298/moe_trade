import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePageMeta, SITE_BRAND } from '../hooks/usePageMeta'
import client from '../api/client'
import { listingsApi, type ListingCounts } from '../api/listings'
import { itemsApi } from '../api/items'
import FilterPopup, { type FilterOption } from '../components/FilterPopup'
import StatRangeFilter from '../components/StatRangeFilter'
import TradeRequestPanel from '../components/TradeRequestPanel'
import PriceAnalyticsModal from '../components/PriceAnalyticsModal'
import Spinner from '../components/Spinner'
import type { Listing, Item, ItemType, ItemCategory, ItemHashtag, ListingSearchParams, StatRange } from '../types'
import { SERVERS } from '../types'
import { itemTypeOf } from '../utils/itemType'
import { TRADE_TYPE_LABEL, SPECIAL_CONDITIONS, BASE_STAT_LABELS, SERVER_COLORS, SKILL_GROUPS, ASSET_PLACEMENTS, ASSET_FUNCTIONS, MASTERY_BY_CODE, remainingLabel } from '../utils/constants'
import { BaseStatBadges, BonusEffectList, OtherInfoCell, PartNamesLabel, SetBaseStatsCell, SetBonusCell, SetSpecialConditionsCell, TechniquePieceNames, techniqueMembersOf } from '../components/equipmentCells'
import InlineHashtags from '../components/InlineHashtags'
import OfficialDbLink from '../components/OfficialDbLink'

// カテゴリツリーをフラットなオプション配列に変換（装備セット親カテゴリも含む）
function categoriesToOptions(categories: ItemCategory[]): FilterOption[] {
  return categories.flatMap((cat) => {
    if (cat.parent_id === null && cat.name === '装備セット') {
      // 装備セットは子カテゴリなし、親カテゴリ自体をオプションとして追加
      return [{ value: String(cat.id), label: '⚔ 装備セット', group: '' }]
    }
    return (cat.children ?? []).map((child) => ({
      value: String(child.id),
      label: child.name,
      group: cat.name,
    }))
  })
}

// 選択された種別IDの中に「装備セット」以外の通常カテゴリが含まれるか
function hasNonEquipSetCategory(selectedIds: string[], categories: ItemCategory[]): boolean {
  const equipSetCat = categories.find((c) => c.parent_id === null && c.name === '装備セット')
  if (!equipSetCat) return selectedIds.length > 0
  return selectedIds.some((id) => id !== String(equipSetCat.id))
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

// 種別切替タブ。ラベルの右に件数バッジを表示する。
// 件数バッジは未取得（count === undefined）でも領域を確保し（invisible）、
// 読み込み前後でタブ幅が変わらないようにする。桁数差でも幅が動きにくいよう min-w と中央寄せを付ける。
function TabLink({ to, label, active, count }: { to: string; label: string; active: boolean; count?: number }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 transition-colors ${active ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}
    >
      <span>{label}</span>
      <span
        className={`text-[10px] leading-none px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-surface-border/60 text-gray-400'} ${count === undefined ? 'invisible' : ''}`}
      >
        {count ?? 0}
      </span>
    </Link>
  )
}

// 「全て」タブのアイテム名脇に表示する種別ラベル
const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  equipment: '装備品',
  technique: 'テクニック',
  asset: 'アセット',
  other: 'その他',
}

// 「全て」タブの情報列で使う、ラベル付きの小ブロック
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

// 「全て」タブの情報列。行ごとに種別を判定し、その種別に応じた情報を1セルにまとめて表示する。
// 各種別タブの効果列と同じ部品（equipmentCells / MasteryBadges）を再利用する。
// categories は装備セットの付加効果表示でテクニック部位を判定するために使う。
function AllInfoCell({ item, type, categories }: { item: Item; type: ItemType; categories: ItemCategory[] }) {
  const dash = <span className="text-xs text-gray-600">—</span>

  if (type === 'technique') {
    const reqs = Object.entries(item.skill_requirements ?? {})
    return (
      <div className="flex flex-col gap-2">
        <Labeled label="必要スキル">
          {reqs.length === 0 ? dash : (
            <div className="flex flex-wrap gap-1">
              {reqs.map(([skill, val]) => (
                <span key={skill} className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
                  {skill}: <span className="text-white font-medium">{val}</span>
                </span>
              ))}
            </div>
          )}
        </Labeled>
        {(item.mastery_requirements?.length ?? 0) > 0 && (
          <Labeled label="必要マスタリ">
            <MasteryBadges codes={item.mastery_requirements} />
          </Labeled>
        )}
      </div>
    )
  }

  if (type === 'asset') {
    const hasPlacement = !!item.placement || !!(item.asset_width && item.asset_height)
    const hasStorage = (item.storage_count ?? 0) > 0 || !!item.special_function
    return (
      <div className="flex flex-col gap-2">
        <Labeled label="設置・サイズ">
          {!hasPlacement ? dash : (
            <div className="flex flex-wrap gap-1">
              {item.placement && (
                <span className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">{item.placement}</span>
              )}
              {item.asset_width && item.asset_height && (
                <span className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
                  {item.asset_width}×{item.asset_height}
                </span>
              )}
            </div>
          )}
        </Labeled>
        <Labeled label="ストレージ・特殊機能">
          {!hasStorage ? dash : (
            <div className="flex flex-wrap gap-1">
              {(item.storage_count ?? 0) > 0 && (
                <span className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
                  ストレージ <span className="text-white font-medium">{item.storage_count}</span>
                </span>
              )}
              {item.special_function && (
                <span className="text-xs bg-primary-500/10 border border-primary-500/30 text-primary-300 rounded px-1.5 py-0.5">
                  {item.special_function}
                </span>
              )}
            </div>
          )}
        </Labeled>
        {item.special_conditions.length > 0 && (
          <Labeled label="特殊条件">
            <div className="flex flex-wrap gap-1">
              {item.special_conditions.map((c) => (
                <span key={c} title={SPECIAL_CONDITIONS[c]} className="text-xs bg-red-900/30 border border-red-700/30 text-red-300 rounded px-1.5 py-0.5">
                  {c}
                </span>
              ))}
            </div>
          </Labeled>
        )}
      </div>
    )
  }

  if (type === 'other') return <OtherInfoCell item={item} />

  // 装備品 / 装備セット
  const isSet = item.is_equipment_set
  const members = item.set_members ?? []
  const hasBase = isSet ? members.length > 0 : (Object.keys(item.base_stats).length > 0 || item.mithril)
  const hasBonus = isSet ? members.length > 0 : item.bonus_effects.length > 0
  const hasSpecial = isSet ? members.length > 0 : item.special_conditions.length > 0
  // セット内のテクニック部位は付加効果内ではなく、情報列の最後に「テクニック」枠で表示する
  const techMembers = isSet ? techniqueMembersOf(members, categories) : []
  return (
    <div className="flex flex-col gap-2">
      <Labeled label="追加効果">
        {isSet ? <SetBaseStatsCell members={members} categories={categories} />
          : hasBase ? <div className="flex flex-wrap gap-1"><BaseStatBadges item={item} /></div> : dash}
      </Labeled>
      <Labeled label="付加効果">
        {isSet ? <SetBonusCell members={members} categories={categories} showTechniqueNames={false} />
          : hasBonus ? <div className="flex flex-col gap-1.5"><BonusEffectList item={item} /></div> : dash}
      </Labeled>
      <Labeled label="特殊条件">
        {isSet ? <SetSpecialConditionsCell members={members} categories={categories} />
          : hasSpecial ? (
            <div className="flex flex-wrap gap-1">
              {item.special_conditions.map((c) => (
                <span key={c} title={SPECIAL_CONDITIONS[c]} className="text-xs bg-red-900/30 border border-red-700/30 text-red-300 rounded px-1.5 py-0.5">
                  {c}
                </span>
              ))}
            </div>
          ) : dash}
      </Labeled>
      {techMembers.length > 0 && (
        <Labeled label="テクニック">
          <div className="flex flex-col gap-1.5"><TechniquePieceNames members={techMembers} /></div>
        </Labeled>
      )}
    </div>
  )
}

interface Props { mode?: 'equipment' | 'all' | 'skill' | 'asset' | 'other' }

export default function ListingsPage({ mode = 'equipment' }: Props) {
  const isAllMode = mode === 'all'
  const isSkillMode = mode === 'skill'
  const isAssetMode = mode === 'asset'
  const isOtherMode = mode === 'other'
  const isEquipmentMode = mode === 'equipment'
  usePageMeta(
    isAllMode ? 'すべての出品一覧' : isSkillMode ? 'スキル・テクニックの出品一覧' : isAssetMode ? 'アセットの出品一覧' : isOtherMode ? 'その他アイテムの出品一覧' : '装備品の出品一覧',
    `${SITE_BRAND}のアイテム取引所。出品中のアイテムを検索して取引チャットで購入できます。`
  )
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // 取引希望送信時に出品が取り下げ／成立していた場合のエラー（詳細ページ等からのリダイレクト）
  const [tradeError, setTradeError] = useState<string | null>(
    (location.state as { tradeError?: string } | null)?.tradeError ?? null
  )

  // 通知メッセージは一度表示したら履歴から消す（リロードや戻る操作で再表示しない）
  useEffect(() => {
    if ((location.state as { tradeError?: string } | null)?.tradeError) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [listings, setListings] = useState<Listing[]>([])
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [bonusValueLabels, setBonusValueLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [mastersLoading, setMastersLoading] = useState(true)
  const [totalPages, setTotalPages] = useState(1)

  const [params, setParams] = useState<ListingSearchParams>({
    sort: 'newest', page: 1,
    // 「全て」タブは種別を問わないため item_type を送らない（バックエンドは未指定で全種別を返す）
    ...(mode === 'all' ? {} : {
      item_type: mode === 'skill' ? 'technique' : mode === 'asset' ? 'asset' : mode === 'other' ? 'other' : 'equipment',
    }),
    // スキルタブの検索モード（通常検索 / 構成検索）。既定は通常検索。
    ...(mode === 'skill' ? { skill_match: 'normal' as const } : {}),
  })
  const [tradeTarget, setTradeTarget] = useState<Listing | null>(null)
  // 相場情報ポップアップの対象アイテム（PCで「相場情報」を押したとき）
  const [analyticsItem, setAnalyticsItem] = useState<{ id: number; name: string } | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set())
  // 既に取引希望済みの listing_id セット
  const [requestedListingIds, setRequestedListingIds] = useState<Set<number>>(new Set())
  // 種別切替タブに表示する各種別の出品件数
  const [counts, setCounts] = useState<ListingCounts | null>(null)

  useEffect(() => {
    setMastersLoading(true)
    Promise.all([
      itemsApi.categories().then((r) => setCategories(r.data)),
      client.get<string[]>('/bonus-value-labels').then((r) => setBonusValueLabels(r.data)),
    ]).finally(() => setMastersLoading(false))
  }, [])

  // ログイン済みの場合、自分の取引希望済み出品IDを取得
  useEffect(() => {
    if (!user) return
    client.get<{ listing_id: number }[] | { data: { listing_id: number }[] }>('/mypage/chats')
      .then((r) => {
        const chats = Array.isArray(r.data) ? r.data : r.data.data
        setRequestedListingIds(new Set<number>(chats.map((c) => c.listing_id)))
      })
      .catch(() => {})
  }, [user])

  useEffect(() => {
    setLoading(true)
    listingsApi.list(params)
      .then((r) => {
        setListings(r.data.data)
        setTotalPages(r.data.last_page)
      })
      .finally(() => setLoading(false))
  }, [params])

  // 種別タブの件数を取得（「取引完了を含める」の切替に追従させる）
  useEffect(() => {
    listingsApi.counts(params.include_completed ?? false)
      .then((r) => setCounts(r.data))
      .catch(() => {})
  }, [params.include_completed])

  // 汎用セッター
  const setParam = (key: keyof ListingSearchParams, value: unknown) =>
    setParams((p) => ({ ...p, [key]: value || undefined, page: 1 }))

  // ハッシュタグ編集後、同じアイテムを参照する全出品の hashtags をローカル更新する
  const updateItemHashtags = (itemId: number, hashtags: ItemHashtag[]) =>
    setListings((prev) =>
      prev.map((l) => (l.item.id === itemId ? { ...l, item: { ...l.item, hashtags } } : l))
    )

  // サーバーチェックボックス
  const toggleServer = (server: string) => {
    const current = params.servers ?? []
    const next = current.includes(server as never)
      ? current.filter((s) => s !== server)
      : [...current, server as never]
    setParam('servers', next.length > 0 ? next : undefined)
  }

  // 数値範囲ハンドラー
  const setBaseStatRange = (key: string, range: StatRange) =>
    setParams((p) => ({
      ...p,
      base_stat_ranges: { ...p.base_stat_ranges, [key]: range },
      page: 1,
    }))

  const setBonusValueRange = (key: string, range: StatRange) =>
    setParams((p) => ({
      ...p,
      bonus_value_ranges: { ...p.bonus_value_ranges, [key]: range },
      page: 1,
    }))

  const setBonusValueKeys = (vals: string[]) => {
    setParams((p) => {
      const ranges = { ...p.bonus_value_ranges }
      Object.keys(ranges).forEach((k) => { if (!vals.includes(k)) delete ranges[k] })
      const sort = p.sort?.startsWith('bonus_') && !vals.some((k) => p.sort?.endsWith(`:${k}`))
        ? 'newest' : p.sort
      return { ...p, bonus_value_keys: vals.length > 0 ? vals : undefined, bonus_value_ranges: ranges, sort, page: 1 }
    })
  }

  // 必要スキル値ハンドラー（スキルタブ用）
  const setSkillRange = (key: string, range: StatRange) =>
    setParams((p) => ({
      ...p,
      skill_ranges: { ...p.skill_ranges, [key]: range },
      page: 1,
    }))

  const setSkillKeys = (vals: string[]) => {
    setParams((p) => {
      const ranges = { ...p.skill_ranges }
      Object.keys(ranges).forEach((k) => { if (!vals.includes(k)) delete ranges[k] })
      return { ...p, skill_keys: vals.length > 0 ? vals : undefined, skill_ranges: ranges, page: 1 }
    })
  }

  // 選択解除時に対応するrangeも削除
  const setBaseStatKeys = (vals: string[]) => {
    setParams((p) => {
      const ranges = { ...p.base_stat_ranges }
      Object.keys(ranges).forEach((k) => { if (!vals.includes(k)) delete ranges[k] })
      const sort = p.sort?.startsWith('stat_') && !vals.some((k) => p.sort?.endsWith(`:${k}`))
        ? 'newest' : p.sort
      return { ...p, base_stat_keys: vals.length > 0 ? vals : undefined, base_stat_ranges: ranges, sort, page: 1 }
    })
  }

  // 付加効果の数値ラベルオプション（values[*].label の一覧）
  const bonusValueOptions: FilterOption[] = bonusValueLabels.map((label) => ({
    value: label,
    label: label,
  }))

  // 追加効果オプション
  const baseStatOptions: FilterOption[] = Object.entries(BASE_STAT_LABELS).map(([k, v]) => ({
    value: k,
    label: v,
  }))

  // 特殊条件オプション
  const specialOptions: FilterOption[] = Object.entries(SPECIAL_CONDITIONS).map(([k, v]) => ({
    value: k,
    label: `${k} — ${v}`,
  }))

  // 必要スキルオプション（スキルタブ用・グループ付き）
  const skillOptions: FilterOption[] = SKILL_GROUPS.flatMap(({ group, skills }) =>
    skills.map((s) => ({ value: s, label: s, group }))
  )

  // 絞り込みパネルの開閉。狭い画面では畳んだ状態、サイドバー表示になる幅（lg以上）では開いた状態で始める
  const [filterOpen, setFilterOpen] = useState(() => window.innerWidth >= 1024)

  // 操作列の末尾リンク：スマホでは「詳細 →」（出品詳細はスマホ専用画面）、
  // PCでは「相場情報」ボタンを表示し、押すと相場ポップアップを開く。
  const detailOrMarket = (l: Listing, withTour = false) => (
    <>
      <Link
        to={`/listings/${l.id}`}
        className="listing-narrow-only text-xs whitespace-nowrap text-gray-500 hover:text-gray-300 transition-colors"
      >
        詳細 →
      </Link>
      <button
        type="button"
        {...(withTour ? { 'data-tour': 'listings-detail' } : {})}
        onClick={() => setAnalyticsItem({ id: l.item.id, name: l.item.name })}
        className="listing-wide-only items-center justify-center w-20 text-xs whitespace-nowrap bg-sky-900/40 hover:bg-sky-900/70 border border-sky-700/50 text-sky-300 px-2.5 py-1 rounded transition-colors"
      >
        相場情報
      </button>
    </>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 取引希望が無効になった場合のエラーバナー */}
      {tradeError && (
        <div className="mb-4 bg-red-900/40 border border-red-600/50 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start justify-between gap-3">
          <span>{tradeError}</span>
          <button
            onClick={() => setTradeError(null)}
            className="text-red-400 hover:text-red-200 shrink-0"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* 未ログイン時の案内バナー */}
      {!user && (
        <div className="mb-4 bg-yellow-900/30 border border-yellow-700/40 rounded-lg px-4 py-3 text-sm text-yellow-200 flex flex-wrap items-center gap-2">
          <span>出品・取引希望にはログインが必要です！</span>
          <Link to="/auth/login" className="underline font-medium hover:text-white transition-colors">ログイン</Link>
          <span className="text-yellow-400/60">/</span>
          <Link to="/auth/register" className="underline font-medium hover:text-white transition-colors">新規登録</Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">出品一覧</h1>
            <div data-tour="listings-modes" className="flex border border-surface-border rounded-lg overflow-hidden text-xs sm:text-sm">
              <TabLink to="/all" label="全て" active={isAllMode} count={counts?.all} />
              <TabLink to="/listings" label="装備品" active={isEquipmentMode} count={counts?.equipment} />
              <TabLink to="/skills" label="テクニック" active={isSkillMode} count={counts?.technique} />
              <TabLink to="/assets" label="アセット" active={isAssetMode} count={counts?.asset} />
              <TabLink to="/others" label="その他" active={isOtherMode} count={counts?.other} />
            </div>
          </div>
        {user && (
          <div data-tour="listings-actions" className="flex items-center gap-2">
            <Link
              to="/listings/new"
              className="bg-primary-500 hover:bg-primary-600 text-white text-sm px-4 py-2 rounded-md transition-colors whitespace-nowrap"
            >
              + 出品する
            </Link>
          </div>
        )}
      </div>

      {mastersLoading ? (
        <Spinner center />
      ) : (
      // lg以上で畳んでいる間はサイドバー列を細いバー（44px）にして、一覧を広げる
      <div className={`grid gap-6 ${filterOpen ? 'grid-cols-1 lg:grid-cols-[280px_1fr]' : 'grid-cols-1 lg:grid-cols-[44px_1fr]'}`}>
        {/* フィルターサイドバー */}
        <aside data-tour="listings-filter" className="space-y-3">
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
            {/* ヘッダー（クリックで開閉）。lg未満は上下に、lg以上は横方向に畳む */}
            <button
              type="button"
              className={`w-full items-center justify-between px-4 py-3 ${filterOpen ? 'flex' : 'flex lg:hidden'}`}
              onClick={() => setFilterOpen((o) => !o)}
              aria-expanded={filterOpen}
            >
              <h2 className="text-sm font-semibold text-gray-300">絞り込み</h2>
              {/* lg未満: 上下シェブロン */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-4 h-4 text-gray-400 transition-transform lg:hidden ${filterOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {/* lg以上: 左シェブロン（横に畳む） */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 text-gray-400 hidden lg:block"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {/* lg以上で畳んだ状態: 縦書きの細いバー */}
            {!filterOpen && (
              <button
                type="button"
                className="hidden lg:flex w-full flex-col items-center gap-2 px-2 py-3 text-gray-300 hover:text-white transition-colors"
                onClick={() => setFilterOpen(true)}
                aria-expanded={false}
                title="絞り込みを開く"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 text-gray-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-sm font-semibold [writing-mode:vertical-rl]">絞り込み</span>
              </button>
            )}
            <div className={`px-4 pb-4 space-y-4 ${filterOpen ? 'block' : 'hidden'}`}>

            {/* アイテム名 */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">アイテム名</label>
              <input
                type="text"
                placeholder="キーワード検索"
                className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                onChange={(e) => setParam('item_name', e.target.value)}
              />
            </div>

            {/* ハッシュタグで絞り込み（タグ名・完全一致。# は省略可） */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">ハッシュタグ</label>
              <input
                type="text"
                placeholder="#ハッシュタグで絞り込み"
                value={params.hashtag ?? ''}
                className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                onChange={(e) => setParam('hashtag', e.target.value.replace(/^[#＃]+/, ''))}
              />
            </div>

            {/* 種別（カテゴリ）— アセット・全てタブはカテゴリで絞り込まないため非表示 */}
            {!isAssetMode && !isAllMode && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">種別</label>
              <FilterPopup
                title="種別を選択"
                options={categoriesToOptions(
                  categories.filter((c) =>
                    isSkillMode ? c.name === 'テクニック'
                    : isOtherMode ? c.name === 'その他'
                    : c.name !== 'テクニック' && c.name !== 'アセット' && c.name !== 'その他')
                )}
                selected={(params.category_ids ?? []).map(String)}
                onChange={(vals) => {
                  setParams((p) => ({
                    ...p,
                    category_ids: vals.map(Number),
                    // 通常カテゴリが選択されていなければ include_equipment_set をリセット
                    include_equipment_set: hasNonEquipSetCategory(vals, categories)
                      ? p.include_equipment_set
                      : undefined,
                    page: 1,
                  }))
                }}
              />
              {/* 装備セットを含める（装備品モードで通常カテゴリが1つ以上選択されているときのみ表示） */}
              {isEquipmentMode && hasNonEquipSetCategory((params.category_ids ?? []).map(String), categories) && (
                <label className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded border border-surface-border hover:border-gray-500 cursor-pointer text-xs text-gray-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={params.include_equipment_set ?? false}
                    onChange={(e) => setParams((p) => ({ ...p, include_equipment_set: e.target.checked || undefined, page: 1 }))}
                    className="accent-amber-500 w-4 h-4"
                  />
                  <span>装備セットを含める</span>
                </label>
              )}
            </div>
            )}

            {/* 必要スキル（テクニック＋その他＝レシピ）。レシピは作成に必要なスキル値で絞り込む。 */}
            {(isSkillMode || isOtherMode) && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">必要スキル</label>
                <FilterPopup
                  title="必要スキルを選択"
                  options={skillOptions}
                  selected={params.skill_keys ?? []}
                  onChange={setSkillKeys}
                  searchable
                />
                {/* 検索モード: 通常検索 / 構成検索（マスタリ概念のあるテクニックのみ） */}
                {isSkillMode && (
                <div className="mt-2">
                  <div className="flex rounded-md overflow-hidden border border-surface-border text-xs">
                    {([
                      { value: 'normal', label: '通常検索' },
                      { value: 'composition', label: '構成検索' },
                    ] as const).map((opt) => {
                      const active = (params.skill_match ?? 'normal') === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setParam('skill_match', opt.value)}
                          className={`flex-1 px-2 py-1.5 transition-colors ${
                            active ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500">
                    {(params.skill_match ?? 'normal') === 'normal'
                      ? '指定したスキルを必要スキルに含むテクニックを表示'
                      : '条件に設定したスキル構成で使用できるテクニックを表示'}
                  </p>
                </div>
                )}
              </div>
            )}

            {/* 設置個所・特殊機能・ストレージ・特殊条件（アセットモードのみ） */}
            {isAssetMode && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">設置個所</label>
                  <FilterPopup
                    title="設置個所を選択"
                    options={ASSET_PLACEMENTS.map((p) => ({ value: p, label: p }))}
                    selected={params.placements ?? []}
                    onChange={(vals) => setParam('placements', vals)}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">特殊機能</label>
                  <FilterPopup
                    title="特殊機能を選択"
                    options={ASSET_FUNCTIONS.map((f) => ({ value: f, label: f }))}
                    selected={params.special_functions ?? []}
                    onChange={(vals) => setParam('special_functions', vals)}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">ストレージ数</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} placeholder="最小"
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
                      onChange={(e) => setParam('storage_min', e.target.value ? Number(e.target.value) : undefined)}
                    />
                    <span className="text-gray-500 shrink-0">〜</span>
                    <input
                      type="number" min={0} placeholder="最大"
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
                      onChange={(e) => setParam('storage_max', e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">特殊条件</label>
                  <FilterPopup
                    title="特殊条件を選択"
                    options={specialOptions}
                    selected={params.special_conditions ?? []}
                    onChange={(vals) => setParam('special_conditions', vals)}
                  />
                </div>
              </>
            )}

            {/* 追加効果・付加効果・特殊条件（装備品モードのみ） */}
            {isEquipmentMode && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">追加効果</label>
                  <FilterPopup
                    title="追加効果を選択"
                    options={baseStatOptions}
                    selected={params.base_stat_keys ?? []}
                    onChange={setBaseStatKeys}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">付加効果</label>
                  <FilterPopup
                    title="付加効果を選択"
                    options={bonusValueOptions}
                    selected={params.bonus_value_keys ?? []}
                    onChange={setBonusValueKeys}
                    searchable
                  />
                  <p className="mt-1 text-[10px] text-gray-500">
                    ※バフ名ではなく、バフの効果で検索してください
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">特殊条件</label>
                  <FilterPopup
                    title="特殊条件を選択"
                    options={specialOptions}
                    selected={params.special_conditions ?? []}
                    onChange={(vals) => setParam('special_conditions', vals)}
                  />
                </div>
              </>
            )}

            {/* サーバー（チェックボックス） */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">サーバー</label>
              <div className="space-y-1.5">
                {SERVERS.map((s) => {
                  const checked = (params.servers ?? []).includes(s)
                  return (
                    <label
                      key={s}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded border cursor-pointer transition-colors ${
                        checked
                          ? 'border-primary-500/60 bg-primary-500/10'
                          : 'border-surface-border hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleServer(s)}
                        className="accent-primary-500 w-4 h-4"
                      />
                      <span className={`text-sm font-medium ${SERVER_COLORS[s].split(' ')[1]}`}>
                        {s}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* 取引完了を含める */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={params.include_completed ?? false}
                onChange={(e) => setParams((p) => ({ ...p, include_completed: e.target.checked || undefined, page: 1 }))}
                className="accent-primary-500 w-4 h-4"
              />
              <span className="text-xs text-gray-400">取引完了を含める</span>
            </label>

            {/* 取引方法 */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">取引方法</label>
              <select
                className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
                onChange={(e) => setParam('trade_type', e.target.value)}
              >
                <option value="">すべて</option>
                {(Object.keys(TRADE_TYPE_LABEL) as Array<keyof typeof TRADE_TYPE_LABEL>).map((k) => (
                  <option key={k} value={k}>{TRADE_TYPE_LABEL[k]}</option>
                ))}
              </select>
            </div>

            {/* 価格帯 */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">価格帯</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="最小"
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
                  onChange={(e) => setParam('price_min', Number(e.target.value))}
                />
                <span className="text-gray-500 shrink-0">〜</span>
                <input
                  type="number"
                  placeholder="最大"
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
                  onChange={(e) => setParam('price_max', Number(e.target.value))}
                />
              </div>
            </div>

            {/* 削れあり（テクニック・アセットは対象外） */}
            {isEquipmentMode && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!params.exclude_worn}
                  onChange={(e) => setParam('exclude_worn', e.target.checked)}
                  className="accent-primary-500"
                />
                <span className="text-sm text-gray-300">削れありを非表示</span>
              </label>
            </div>
            )}
            </div>{/* filterOpen 折りたたみエリア終了 */}
          </div>
        </aside>

        {/* 一覧 */}
        <div>
          {/* 必要スキル値の範囲絞り込み（スキルモード） */}
          {(params.skill_keys?.length ?? 0) > 0 && (
            <div className="mb-4">
              <StatRangeFilter
                title="必要スキル値"
                items={(params.skill_keys ?? []).map((k) => ({ key: k, label: k }))}
                ranges={params.skill_ranges ?? {}}
                onChange={setSkillRange}
              />
              {/* 通常検索のとき、マスタリ構成スキルも対象にするか（テクニックのみ） */}
              {isSkillMode && (params.skill_match ?? 'normal') === 'normal' && (
                <label className="mt-2 flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!params.skill_include_mastery}
                    onChange={(e) => setParam('skill_include_mastery', e.target.checked)}
                    className="accent-primary-500 w-4 h-4"
                  />
                  <span className="text-xs text-gray-300">マスタリに含まれるスキルも対象にする</span>
                </label>
              )}
            </div>
          )}

          {/* 数値絞り込みエリア */}
          {(params.base_stat_keys?.length ?? 0) > 0 && (
            <div className="mb-4">
              <StatRangeFilter
                title="追加効果"
                items={(params.base_stat_keys ?? []).map((k) => ({
                  key: k,
                  label: BASE_STAT_LABELS[k] ?? k,
                }))}
                ranges={params.base_stat_ranges ?? {}}
                onChange={setBaseStatRange}
              />
            </div>
          )}

          {(params.bonus_value_keys?.length ?? 0) > 0 && (
            <div className="mb-4">
              <StatRangeFilter
                title="付加効果"
                items={(params.bonus_value_keys ?? []).map((k) => ({
                  key: k,
                  label: k,
                }))}
                ranges={params.bonus_value_ranges ?? {}}
                onChange={setBonusValueRange}
              />
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-400">{listings.length}件表示</p>
              {/* ハッシュタグ絞り込み中の表示と解除 */}
              {params.hashtag && (
                <button
                  type="button"
                  onClick={() => setParam('hashtag', undefined)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-primary-500 bg-primary-500/10 text-primary-300 text-xs hover:bg-primary-500/20 transition-colors"
                >
                  <span>#{params.hashtag}</span>
                  <span aria-hidden="true">×</span>
                  <span className="sr-only">タグ絞り込みを解除</span>
                </button>
              )}
            </div>
            <select
              value={params.sort ?? 'newest'}
              className="bg-surface-card border border-surface-border rounded px-3 py-1 text-sm text-white focus:outline-none"
              onChange={(e) => setParam('sort', e.target.value)}
            >
              <option value="newest">新着順</option>
              <option value="name_asc">あいうえお順</option>
              <option value="price_asc">価格が安い順</option>
              <option value="price_desc">価格が高い順</option>
              {(params.base_stat_keys ?? []).map((k) => (
                <optgroup key={k} label={BASE_STAT_LABELS[k] ?? k}>
                  <option value={`stat_desc:${k}`}>{BASE_STAT_LABELS[k] ?? k}が高い順</option>
                  <option value={`stat_asc:${k}`}>{BASE_STAT_LABELS[k] ?? k}が低い順</option>
                </optgroup>
              ))}
              {(params.bonus_value_keys ?? []).map((label) => (
                <optgroup key={label} label={label}>
                  <option value={`bonus_desc:${label}`}>{label}が高い順</option>
                  <option value={`bonus_asc:${label}`}>{label}が低い順</option>
                </optgroup>
              ))}
            </select>
          </div>

          <div className="listing-table-container bg-surface-card border border-surface-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-52">アイテム</th>
                  {isAllMode ? (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide" colSpan={3}>情報</th>
                  ) : isSkillMode ? (
                    <>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide" colSpan={2}>必要スキル</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide">必要マスタリ</th>
                    </>
                  ) : isAssetMode ? (
                    <>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide">設置・サイズ</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide">ストレージ・特殊機能</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide">特殊条件</th>
                    </>
                  ) : isOtherMode ? (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide" colSpan={3}>情報</th>
                  ) : (
                    <>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide">追加効果</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide">付加効果</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide">特殊条件</th>
                    </>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider listing-col-wide">取引</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">価格</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-16 text-gray-500">読み込み中...</td></tr>
                ) : listings.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-16 text-gray-500">出品が見つかりません</td></tr>
                ) : (
                  listings.map((l) => {
                    const daysLeft = Math.ceil((new Date(l.expires_at).getTime() - Date.now()) / 86400000)
                    const isOpen = tradeTarget?.id === l.id
                    const isDone = completedIds.has(l.id) || requestedListingIds.has(l.id)
                    const isMyListing = user?.id === l.user_id
                    const isCompleted = l.status === 'completed'
                    return (
                      <React.Fragment key={l.id}>
                      <tr
                        className={`transition-colors ${isOpen ? 'bg-primary-500/5' : 'hover:bg-surface-border/20'}`}
                      >
                        {/* アイテム名・種別 */}
                        <td data-tour="listings-itemname" className="px-4 py-3">
                          {l.item.verified_status === 'unverified' && (
                            <span
                              tabIndex={0}
                              className="group relative inline-block mb-1 text-xs text-yellow-400 cursor-help focus:outline-none"
                            >
                              ⚠ 確認中
                              <span className="absolute left-0 top-full mt-1 z-20 hidden group-hover:block group-focus:block w-64 bg-surface-card border border-yellow-700/50 rounded-md px-3 py-2 text-xs text-yellow-200 shadow-xl whitespace-normal">
                                アイテムの情報が正確でない場合があります。wiki等で確認してからの取引をお願いします。
                              </span>
                            </span>
                          )}
                          <div className="flex items-center gap-1 flex-wrap">
                            {/* 全てタブでは種別を一目で分かるよう種別ラベルを先頭に表示 */}
                            {isAllMode && !l.item.is_equipment_set && (
                              <span className="text-[10px] bg-surface-border/60 text-gray-300 rounded px-1.5 py-0.5">
                                {ITEM_TYPE_LABEL[itemTypeOf(l.item.category, categories)]}
                              </span>
                            )}
                            {l.item.is_equipment_set ? (
                              <span className="text-xs bg-amber-900/30 border border-amber-600/40 text-amber-300 rounded px-1.5 py-0.5">
                                ⚔ 装備セット
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">{l.item.category.name}</span>
                            )}
                            {!isSkillMode && l.is_worn && (
                              <span
                                title="削れあり（耐久度に削れがある中古品）"
                                className="text-xs text-amber-300 bg-amber-900/30 border border-amber-600/40 rounded px-1.5 py-0.5 shrink-0"
                              >
                                ⚠ 削れあり
                              </span>
                            )}
                            {!isSkillMode && l.is_dyed && (
                              <span
                                title="染色済み（染色液で色を変更済み）"
                                className="text-xs text-fuchsia-300 bg-fuchsia-900/30 border border-fuchsia-600/40 rounded px-1.5 py-0.5 shrink-0"
                              >
                                🎨 染色済み
                              </span>
                            )}
                          </div>
                          <p className="text-white font-medium">{l.item.name}</p>
                          {/* セットの部位名をアイテム名の下に表示 */}
                          {l.item.is_equipment_set && (l.item.set_members?.length ?? 0) > 0 && (
                            <div className="mt-1">
                              <PartNamesLabel names={l.item.set_members!.map((m) => m.category.name)} />
                            </div>
                          )}
                          {/* 公式DBリンクとハッシュタグは同じ行にまとめる（改行で縦に広がらないように） */}
                          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                            {l.item.official_url && <OfficialDbLink url={l.item.official_url} />}
                            {/* ハッシュタグ（クリックでまとめて編集。ログイン時のみ） */}
                            <InlineHashtags
                              itemId={l.item.id}
                              hashtags={l.item.hashtags}
                              editable={!!user}
                              size="sm"
                              onSaved={(hashtags) => updateItemHashtags(l.item.id, hashtags)}
                            />
                          </div>
                        </td>

                        {isAllMode ? (
                          /* 全てタブ: 行ごとに種別を判定し、その種別の情報を1セルにまとめて表示 */
                          <td className="listing-col-wide px-4 py-3 align-top" colSpan={3}>
                            <AllInfoCell item={l.item} type={itemTypeOf(l.item.category, categories)} categories={categories} />
                          </td>
                        ) : isSkillMode ? (
                          <>
                          {/* 必要スキル値 */}
                          <td className="listing-col-wide px-4 py-3 align-top" colSpan={2}>
                            <div className="flex flex-wrap gap-1">
                              {!l.item.skill_requirements || Object.keys(l.item.skill_requirements).length === 0 ? (
                                <span className="text-xs text-gray-600">—</span>
                              ) : Object.entries(l.item.skill_requirements).map(([skill, val]) => (
                                <span key={skill} className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
                                  {skill}: <span className="text-white font-medium">{val}</span>
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* 必要マスタリ（条件スキルも表示） */}
                          <td className="listing-col-wide px-4 py-3 align-top">
                            <MasteryBadges codes={l.item.mastery_requirements} />
                          </td>
                          </>
                        ) : isAssetMode ? (
                          <>
                          {/* 設置・サイズ */}
                          <td className="listing-col-wide px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {l.item.placement && (
                                <span className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">{l.item.placement}</span>
                              )}
                              {(l.item.asset_width && l.item.asset_height) ? (
                                <span className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
                                  {l.item.asset_width}×{l.item.asset_height}
                                </span>
                              ) : null}
                              {!l.item.placement && !(l.item.asset_width && l.item.asset_height) && (
                                <span className="text-xs text-gray-600">—</span>
                              )}
                            </div>
                          </td>

                          {/* ストレージ・特殊機能 */}
                          <td className="listing-col-wide px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(l.item.storage_count ?? 0) > 0 && (
                                <span className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
                                  ストレージ <span className="text-white font-medium">{l.item.storage_count}</span>
                                </span>
                              )}
                              {l.item.special_function && (
                                <span className="text-xs bg-primary-500/10 border border-primary-500/30 text-primary-300 rounded px-1.5 py-0.5">
                                  {l.item.special_function}
                                </span>
                              )}
                              {!(l.item.storage_count ?? 0) && !l.item.special_function && (
                                <span className="text-xs text-gray-600">—</span>
                              )}
                            </div>
                          </td>

                          {/* 特殊条件 */}
                          <td className="listing-col-wide px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {l.item.special_conditions.length === 0 ? (
                                <span className="text-xs text-gray-600">—</span>
                              ) : l.item.special_conditions.map((c) => (
                                <span key={c} title={SPECIAL_CONDITIONS[c]}
                                  className="text-xs bg-red-900/30 border border-red-700/30 text-red-300 rounded px-1.5 py-0.5">
                                  {c}
                                </span>
                              ))}
                            </div>
                          </td>
                          </>
                        ) : isOtherMode ? (
                          <td className="listing-col-wide px-4 py-3" colSpan={3}>
                            <OtherInfoCell item={l.item} />
                          </td>
                        ) : (
                          <>
                          {/* 追加効果 */}
                          <td className="listing-col-wide px-4 py-3">
                            {l.item.is_equipment_set ? (
                              <SetBaseStatsCell members={l.item.set_members ?? []} categories={categories} />
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {Object.keys(l.item.base_stats).length === 0 && !l.item.mithril ? (
                                  <span className="text-xs text-gray-600">—</span>
                                ) : (
                                  <BaseStatBadges item={l.item} />
                                )}
                              </div>
                            )}
                          </td>

                          {/* 付加効果 */}
                          <td className="listing-col-wide px-4 py-3">
                            {l.item.is_equipment_set ? (
                              <SetBonusCell members={l.item.set_members ?? []} categories={categories} />
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {l.item.bonus_effects.length === 0 ? (
                                  <span className="text-xs text-gray-600">—</span>
                                ) : (
                                  <BonusEffectList item={l.item} />
                                )}
                              </div>
                            )}
                          </td>

                          {/* 特殊条件 */}
                          <td className="listing-col-wide px-4 py-3">
                            {l.item.is_equipment_set ? (
                              <SetSpecialConditionsCell members={l.item.set_members ?? []} categories={categories} />
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {l.item.special_conditions.length === 0 ? (
                                  <span className="text-xs text-gray-600">—</span>
                                ) : l.item.special_conditions.map((c) => (
                                  <span key={c} title={SPECIAL_CONDITIONS[c]}
                                    className="text-xs bg-red-900/30 border border-red-700/30 text-red-300 rounded px-1.5 py-0.5">
                                    {c}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          </>
                        )}

                        {/* 取引方法・サーバー */}
                        <td className="listing-col-wide px-4 py-3 min-w-[8.5rem]">
                          <div data-tour="listings-tradetype" className="flex flex-wrap gap-1 mb-1">
                            <span className={`px-2 py-0.5 rounded whitespace-nowrap ${l.trade_type === 'auction' ? 'text-[10px] bg-amber-900/40 border border-amber-600/40 text-amber-200' : 'text-xs bg-surface text-gray-300'}`}>
                              {l.trade_type === 'auction' ? '🔨 オークション' : TRADE_TYPE_LABEL[l.trade_type]}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {l.servers.map((s) => (
                              <div key={s.server} className="flex items-center gap-1.5">
                                <span title={s.server} className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SERVER_COLORS[s.server]}`}>
                                  {s.server[0]}
                                </span>
                                {s.character?.character_name && (
                                  <span className="text-xs text-gray-300 whitespace-nowrap">{s.character.character_name}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* 価格・期限 */}
                        <td className="px-3 py-3 text-right">
                          {l.trade_type === 'auction' ? (
                            <>
                              <p className="text-[10px] text-amber-300/80 leading-none">現在価格</p>
                              <p className="text-base font-bold text-amber-300 whitespace-nowrap">{(l.current_price ?? l.price).toLocaleString()} {l.currency}</p>
                              <p className="text-[10px] text-gray-500 whitespace-nowrap">入札 {l.bid_count ?? 0}件{l.buyout_price != null && ` ・即決 ${l.buyout_price.toLocaleString()}`}</p>
                            </>
                          ) : (
                            <p className="text-base font-bold text-primary-500 whitespace-nowrap">{l.price} {l.currency}</p>
                          )}
                          <p className={`text-xs mt-0.5 whitespace-nowrap ${daysLeft <= 3 ? 'text-orange-400' : 'text-gray-500'}`}>
                            {remainingLabel(l.expires_at, l.trade_type === 'auction')}
                          </p>
                        </td>

                        {/* 操作 */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isMyListing || isCompleted ? (
                            <div className="flex flex-col gap-1 items-end">
                              {isCompleted && <span className="text-xs text-primary-500">✓ 取引完了</span>}
                              {detailOrMarket(l)}
                            </div>
                          ) : isDone ? (
                            <div className="flex flex-col gap-1 items-end">
                              <span className="text-xs text-primary-500">✓ 希望済み</span>
                              {detailOrMarket(l)}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 items-end">
                              {user && !!user.email_verified_at && (
                                <button
                                  data-tour="listings-trade"
                                  onClick={() => setTradeTarget(isOpen ? null : l)}
                                  className={`inline-flex items-center justify-center w-20 text-xs whitespace-nowrap px-2.5 py-1 rounded border transition-colors ${
                                    isOpen
                                      ? 'border-gray-500 text-gray-400 hover:text-white'
                                      : 'border-primary-500/60 bg-primary-500/10 text-primary-400 hover:bg-primary-500/20'
                                  }`}
                                >
                                  {isOpen ? 'キャンセル' : '取引'}
                                </button>
                              )}
                              {detailOrMarket(l, true)}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* 出品コメント行（コメントがある場合のみ、アイテム行の直下に表示） */}
                      {l.comment && (
                        <tr className={`!border-t-0 ${isOpen ? 'bg-primary-500/5' : ''}`}>
                          <td colSpan={7} className="px-4 pb-3 pt-0">
                            <p className="text-xs text-gray-300 bg-surface rounded px-3 py-2 whitespace-pre-wrap break-words">
                              <span className="text-gray-500 mr-1.5 select-none">💬</span>
                              {l.comment}
                            </p>
                          </td>
                        </tr>
                      )}

                      {/* 取引希望パネル（行を展開） */}
                      {isOpen && (
                        <tr key={`panel-${l.id}`}>
                          <td colSpan={7} className="px-4 pb-4">
                            <TradeRequestPanel
                              source={l}
                              kind="listing"
                              onComplete={() => {
                                setCompletedIds((prev) => new Set([...prev, l.id]))
                                setRequestedListingIds((prev) => new Set([...prev, l.id]))
                                setTradeTarget(null)
                              }}
                              onCancel={() => setTradeTarget(null)}
                              onUnavailable={() => {
                                setTradeTarget(null)
                                setTradeError('この出品は取り下げ、または取引成立済みのため取引できませんでした。')
                                // 一覧を再取得して無効になった出品を除外する
                                setParams((p) => ({ ...p }))
                                // 上部のエラーバナーが見えるようスクロール
                                window.scrollTo({ top: 0, behavior: 'smooth' })
                              }}
                            />
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setParams((prev) => ({ ...prev, page: p }))}
                  className={`w-8 h-8 rounded text-sm transition-colors ${
                    params.page === p
                      ? 'bg-primary-500 text-white'
                      : 'bg-surface-card text-gray-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* 相場情報ポップアップ（PCの「相場情報」ボタン用） */}
      {analyticsItem && (
        <PriceAnalyticsModal
          itemId={analyticsItem.id}
          itemName={analyticsItem.name}
          onClose={() => setAnalyticsItem(null)}
        />
      )}
    </div>
  )
}
