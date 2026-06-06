import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import client from '../api/client'
import { listingsApi } from '../api/listings'
import { itemsApi } from '../api/items'
import FilterPopup, { type FilterOption } from '../components/FilterPopup'
import StatRangeFilter from '../components/StatRangeFilter'
import TradeRequestPanel from '../components/TradeRequestPanel'
import Spinner from '../components/Spinner'
import type { Listing, ItemCategory, ListingSearchParams, StatRange } from '../types'
import { SERVERS } from '../types'
import { TRADE_TYPE_LABEL, SPECIAL_CONDITIONS, BASE_STAT_LABELS, SERVER_COLORS } from '../utils/constants'

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

interface Props { mode?: 'equipment' | 'skill' }

export default function ListingsPage({ mode = 'equipment' }: Props) {
  const isSkillMode = mode === 'skill'
  const { user } = useAuth()
  const [listings, setListings] = useState<Listing[]>([])
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [bonusValueLabels, setBonusValueLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [mastersLoading, setMastersLoading] = useState(true)
  const [totalPages, setTotalPages] = useState(1)

  const [params, setParams] = useState<ListingSearchParams>({
    sort: 'newest', page: 1,
    ...(mode === 'skill' ? { is_skill: true } : { is_skill: false }),
  })
  const [tradeTarget, setTradeTarget] = useState<Listing | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set())
  // 既に取引希望済みの listing_id セット
  const [requestedListingIds, setRequestedListingIds] = useState<Set<number>>(new Set())

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

  // 汎用セッター
  const setParam = (key: keyof ListingSearchParams, value: unknown) =>
    setParams((p) => ({ ...p, [key]: value || undefined, page: 1 }))

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

  const [filterOpen, setFilterOpen] = useState(typeof window !== 'undefined' && window.innerWidth >= 1024)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">出品一覧</h1>
            <div className="flex border border-surface-border rounded-lg overflow-hidden text-sm">
              <Link to="/listings" className={`px-4 py-1.5 transition-colors ${!isSkillMode ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}>装備品</Link>
              <Link to="/skills" className={`px-4 py-1.5 transition-colors ${isSkillMode ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}>スキル</Link>
            </div>
          </div>
        {user && (
          <Link
            to="/listings/new"
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm px-4 py-2 rounded-md transition-colors"
          >
            + 出品する
          </Link>
        )}
      </div>

      {mastersLoading ? (
        <Spinner center />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* フィルターサイドバー */}
        <aside className="space-y-3">
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
            {/* ヘッダー（スマホ時はボタン） */}
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 lg:cursor-default"
              onClick={() => setFilterOpen((o) => !o)}
            >
              <h2 className="text-sm font-semibold text-gray-300">絞り込み</h2>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-4 h-4 text-gray-400 transition-transform lg:hidden ${filterOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className={`px-4 pb-4 space-y-4 lg:block ${filterOpen ? 'block' : 'hidden'}`}>

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

            {/* 種別（カテゴリ） */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">種別</label>
              <FilterPopup
                title="種別を選択"
                options={categoriesToOptions(
                  categories.filter((c) => (isSkillMode ? c.name === 'スキル' : c.name !== 'スキル'))
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
              {/* 装備セットを含める（通常カテゴリが1つ以上選択されているときのみ表示） */}
              {!isSkillMode && hasNonEquipSetCategory((params.category_ids ?? []).map(String), categories) && (
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

            {/* 追加効果・付加効果・特殊条件（装備品モードのみ） */}
            {!isSkillMode && (
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
            </div>{/* filterOpen 折りたたみエリア終了 */}
          </div>
        </aside>

        {/* 一覧 */}
        <div>
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
            <p className="text-sm text-gray-400">{listings.length}件表示</p>
            <select
              value={params.sort ?? 'newest'}
              className="bg-surface-card border border-surface-border rounded px-3 py-1 text-sm text-white focus:outline-none"
              onChange={(e) => setParam('sort', e.target.value)}
            >
              <option value="newest">新着順</option>
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

          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-48">アイテム</th>
                  {isSkillMode ? (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={3}>必要スキル</th>
                  ) : (
                    <>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">追加効果</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">付加効果</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">特殊条件</th>
                    </>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">取引</th>
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
                        <td className="px-4 py-3">
                          {l.item.verified_status === 'unverified' && (
                            <span className="inline-block mb-1 text-xs text-yellow-400">⚠ 未確認</span>
                          )}
                          <div className="flex items-center gap-1 flex-wrap">
                            {l.item.is_equipment_set ? (
                              <span className="text-xs bg-amber-900/30 border border-amber-600/40 text-amber-300 rounded px-1.5 py-0.5">⚔ 装備セット</span>
                            ) : (
                              <span className="text-xs text-gray-400">{l.item.category.name}</span>
                            )}
                          </div>
                          <p className="text-white font-medium">{l.item.name}</p>
                          {l.item.is_equipment_set && l.item.set_piece_category_ids && l.item.set_piece_category_ids.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {l.item.set_piece_category_ids.length}部位セット
                            </p>
                          )}
                        </td>

                        {isSkillMode ? (
                          /* スキル必要スキル値 */
                          <td className="px-4 py-3" colSpan={3}>
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
                        ) : (
                          <>
                          {/* 追加効果 */}
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {Object.keys(l.item.base_stats).length === 0 && !l.item.mithril ? (
                                <span className="text-xs text-gray-600">—</span>
                              ) : (
                                <>
                                  {Object.entries(l.item.base_stats).map(([key, val]) => (
                                    <span key={key} className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
                                      {BASE_STAT_LABELS[key] ?? key}: <span className="text-white font-medium">{val}</span>
                                    </span>
                                  ))}
                                  {l.item.mithril && (
                                    <span className="text-xs bg-slate-700/40 border border-slate-400/40 rounded px-1.5 py-0.5 text-slate-200">
                                      ミスリル
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>

                          {/* 付加効果 */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1.5">
                              {l.item.bonus_effects.length === 0 ? (
                                <span className="text-xs text-gray-600">—</span>
                              ) : l.item.bonus_effects.map((e) => (
                                <div key={e.id} className="text-xs bg-surface border border-primary-500/20 rounded px-2 py-1">
                                  <p className="text-primary-500 font-medium">{e.effect_name}</p>
                                  {e.values?.map((v, i) => (
                                    <p key={i} className="text-gray-400 whitespace-nowrap">
                                      {v.label && <span>{v.label}：</span>}
                                      <span className="text-gray-200">{v.value}{v.value_unit === '%' ? '%' : v.value_unit === 'x' ? '倍' : v.value_unit === 'per_min' ? '/min' : ''}</span>
                                    </p>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* 特殊条件 */}
                          <td className="px-4 py-3">
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
                        )}

                        {/* 取引方法・サーバー */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 mb-1">
                            <span className="text-xs bg-surface text-gray-300 px-2 py-0.5 rounded">
                              {TRADE_TYPE_LABEL[l.trade_type]}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {l.servers.map((s) => (
                              <div key={s.server} className="flex items-center gap-1.5">
                                <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${SERVER_COLORS[s.server]}`}>
                                  {s.server}
                                </span>
                                {s.character?.character_name && (
                                  <span className="text-xs text-gray-300">{s.character.character_name}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* 価格・期限 */}
                        <td className="px-3 py-3 text-right">
                          <p className="text-base font-bold text-primary-500 whitespace-nowrap">{l.price} {l.currency}</p>
                          <p className={`text-xs mt-0.5 ${daysLeft <= 3 ? 'text-orange-400' : 'text-gray-500'}`}>
                            残り{daysLeft}日
                          </p>
                        </td>

                        {/* 操作 */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isMyListing || isCompleted ? (
                            <div className="flex flex-col gap-1 items-end">
                              {isCompleted && <span className="text-xs text-primary-500">✓ 取引完了</span>}
                              <Link to={`/listings/${l.id}`} className="text-xs text-gray-500 hover:text-gray-300">詳細 →</Link>
                            </div>
                          ) : isDone ? (
                            <div className="flex flex-col gap-1 items-end">
                              <span className="text-xs text-primary-500">✓ 希望済み</span>
                              <Link to={`/listings/${l.id}`} className="text-xs text-gray-500 hover:text-gray-300">詳細 →</Link>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 items-end">
                              {user && (
                                <button
                                  onClick={() => setTradeTarget(isOpen ? null : l)}
                                  className={`text-xs whitespace-nowrap px-3 py-1.5 rounded border transition-colors ${
                                    isOpen
                                      ? 'border-gray-500 text-gray-400 hover:text-white'
                                      : 'border-primary-500/60 bg-primary-500/10 text-primary-400 hover:bg-primary-500/20'
                                  }`}
                                >
                                  {isOpen ? 'キャンセル' : '取引'}
                                </button>
                              )}
                              <Link
                                to={`/listings/${l.id}`}
                                className="text-xs whitespace-nowrap text-gray-500 hover:text-gray-300 transition-colors"
                              >
                                詳細 →
                              </Link>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* 取引希望パネル（行を展開） */}
                      {isOpen && (
                        <tr key={`panel-${l.id}`}>
                          <td colSpan={7} className="px-4 pb-4">
                            <TradeRequestPanel
                              listing={l}
                              onComplete={() => {
                                setCompletedIds((prev) => new Set([...prev, l.id]))
                                setRequestedListingIds((prev) => new Set([...prev, l.id]))
                                setTradeTarget(null)
                              }}
                              onCancel={() => setTradeTarget(null)}
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
    </div>
  )
}
