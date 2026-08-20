import React, { useEffect, useState, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import client from '../api/client'
import { buyRequestsApi } from '../api/buyRequests'
import { useAuth } from '../contexts/AuthContext'
import { usePageMeta, SITE_BRAND } from '../hooks/usePageMeta'
import TradeRequestPanel from '../components/TradeRequestPanel'
import PriceAnalyticsModal from '../components/PriceAnalyticsModal'
import OfficialDbLink from '../components/OfficialDbLink'
import ListDisplayToggle from '../components/ListDisplayToggle'
import ItemDetailModal from '../components/ItemDetailModal'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { getListDisplayMode, setListDisplayMode, PER_PAGE_BY_MODE, type ListDisplayMode } from '../utils/listDisplayStore'
import type { BuyRequest, Item, Paginated } from '../types'
import { TRADE_TYPE_LABEL, SERVER_COLORS, remainingLabel, deadlineTooltip } from '../utils/constants'

/**
 * 貼り付けテキストからアイテム名だけを抽出する。
 *
 * 公式サイトの所持アイテム一覧（タブ区切り）にも、1行1アイテム名の単純な
 * リストにも対応する。タブ区切り行は「転送(○/×)」列の2つ左をアイテム名とみなす
 * （一括出品の解析と同じ考え方）。それ以外の行はトリムした文字列をそのまま名前とする。
 */
function parseNames(text: string): string[] {
  const names: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (line.includes('\t')) {
      const cells = line.split('\t').map((c) => c.trim())
      // ヘッダー行は除外
      if (cells.some((c) => c === 'アイテム名' || c === 'No▼' || c === 'カテゴリ')) continue
      const tIdx = cells.findIndex((c) => ['○', '◯', '×', '✕', 'x'].includes(c))
      const name = tIdx >= 2 ? cells[tIdx - 2] : cells.find((c) => c && !/^\d+$/.test(c)) ?? ''
      if (name && name !== '空き') names.push(name)
    } else {
      if (trimmed === 'アイテム名' || trimmed === '空き') continue
      names.push(trimmed)
    }
  }
  // 重複除去
  return Array.from(new Set(names))
}

export default function BuyRequestsPage() {
  usePageMeta(
    '買取一覧',
    `${SITE_BRAND}のアイテム買取（買いたい）一覧。買取中のアイテムを検索して取引チャットで売却できます。`
  )
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // 売却申し出時に買取が取り下げ／成立していた場合のエラー（詳細ページ等からのリダイレクト）
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

  const [itemName, setItemName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  // 実際に適用中の絞り込み条件
  const [appliedName, setAppliedName] = useState('')
  const [appliedNames, setAppliedNames] = useState<string[]>([])
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<Paginated<BuyRequest> | null>(null)
  const [loading, setLoading] = useState(true)

  // 行下に展開する取引希望パネルの対象
  const [tradeTarget, setTradeTarget] = useState<BuyRequest | null>(null)
  // 相場情報ポップアップの対象アイテム（PCで「相場情報」を押したとき）
  const [analyticsItem, setAnalyticsItem] = useState<{ id: number; name: string } | null>(null)
  // 既に売却を申し出済みの buy_request_id セット（この画面での申し出も含む）
  const [requestedIds, setRequestedIds] = useState<Set<number>>(new Set())

  // 表示モード（詳細 / シンプル）。出品一覧と同じキーで端末ごとに保持する。
  // 1ページの件数が表示モードで変わる（シンプルは100件）ため、一覧取得より前に置く。
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>(() => getListDisplayMode())
  const compact = displayMode === 'compact'
  const perPage = PER_PAGE_BY_MODE[displayMode]

  const fetchList = useCallback(() => {
    setLoading(true)
    buyRequestsApi
      .list({
        item_name: appliedName || undefined,
        item_names: appliedNames.length > 0 ? appliedNames : undefined,
        sort,
        page,
        per_page: perPage,
      })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false))
  }, [appliedName, appliedNames, sort, page, perPage])

  useEffect(() => { fetchList() }, [fetchList])

  // ログイン済みの場合、自分が売却を申し出済みの買取IDを取得（買取への取引希望 = selling-offers）
  useEffect(() => {
    if (!user) return
    client.get<{ buy_request_id: number }[]>('/mypage/selling-offers')
      .then((r) => {
        const chats = Array.isArray(r.data) ? r.data : []
        setRequestedIds(new Set<number>(chats.map((c) => c.buy_request_id)))
      })
      .catch(() => {})
  }, [user])

  const applyFilters = () => {
    setAppliedName(itemName.trim())
    setAppliedNames(showPaste ? parseNames(pasteText) : [])
    setPage(1)
  }

  const clearFilters = () => {
    setItemName('')
    setPasteText('')
    setShowPaste(false)
    setAppliedName('')
    setAppliedNames([])
    setPage(1)
  }

  const hasFilter = appliedName !== '' || appliedNames.length > 0

  const changeDisplayMode = (m: ListDisplayMode) => {
    setDisplayMode(m)
    setListDisplayMode(m)
    // 件数が変わるとページ割りも変わるため1ページ目に戻す
    setPage(1)
  }
  // 操作列のボタン配置。シンプル表示は横並びにして行の高さを詰める
  const actionsClass = compact ? 'flex items-center justify-end gap-1' : 'flex flex-col gap-1 items-end'

  // シンプル表示のアイテム名クリックで開くアイテム詳細（PC はポップアップ、スマホは /items/:id へ遷移。出品一覧と同じ）
  const isWideScreen = useMediaQuery('(min-width: 768px)')
  const [detailItemId, setDetailItemId] = useState<number | null>(null)

  const compactItemName = (item: Item) => {
    const cls = 'text-white font-medium text-left hover:text-primary-300 hover:underline transition-colors'
    return isWideScreen ? (
      <button type="button" title="アイテム詳細を表示" onClick={() => setDetailItemId(item.id)} className={cls}>
        {item.name}
      </button>
    ) : (
      <Link to={`/items/${item.id}`} className={`block ${cls}`}>{item.name}</Link>
    )
  }

  // 操作列の末尾リンク：スマホでは「詳細 →」（買取詳細ページへ）、
  // PCでは「相場情報」ボタンを表示し、押すと相場ポップアップを開く（出品一覧と同じ構成）。
  // シンプル表示は列を絞って幅に余裕があるため、幅によらず「相場情報」ボタンだけを出す。
  const detailOrMarket = (b: BuyRequest) => (
    <>
      {!compact && (
        <Link
          to={`/buy-requests/${b.id}`}
          className="listing-narrow-only text-xs whitespace-nowrap text-gray-500 hover:text-gray-300 transition-colors"
        >
          詳細 →
        </Link>
      )}
      <button
        type="button"
        onClick={() => setAnalyticsItem({ id: b.item.id, name: b.item.name })}
        className={`${compact ? 'inline-flex' : 'listing-wide-only'} items-center justify-center w-20 text-xs whitespace-nowrap bg-sky-900/40 hover:bg-sky-900/70 border border-sky-700/50 text-sky-300 px-2.5 py-1 rounded transition-colors`}
      >
        相場情報
      </button>
    </>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 売却申し出が無効になった場合のエラーバナー */}
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

      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-xl font-bold text-white">買取一覧</h1>
        {user && (
          <Link
            to="/buy-requests/new"
            className="text-sm bg-primary-500 hover:bg-primary-600 text-white px-4 py-1.5 rounded-md transition-colors shrink-0"
          >
            買取する
          </Link>
        )}
      </div>
      <p className="text-sm text-gray-400 mb-5">
        「買いたい」アイテムの募集一覧です。装備品・テクニック・アセットをまとめてアイテム名で検索できます。
      </p>

      {/* 絞り込み（アイテム名のみ） */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="アイテム名で検索（部分一致）"
            className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
          <button
            type="button"
            onClick={applyFilters}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm px-5 rounded transition-colors shrink-0"
          >
            検索
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
        >
          {showPaste ? '▲ アイテム一覧の貼り付けを閉じる' : '▼ 複数のアイテム名で絞り込む（一覧を貼り付け）'}
        </button>

        {showPaste && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">
              アイテム名を改行区切りで貼り付けるか、公式サイトの所持アイテム一覧（タブ区切り）をそのまま貼り付けてください。
            </p>
            <textarea
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`レンタル\tNo▼\tアイテム名\tカテゴリ\t転送\t個数
1\tアイネの抱っこぬいぐるみ\t中級者レア\t○\t1
3\tアクアマリン\t中級者アンコモン\t○\t321`}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 font-mono"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={applyFilters}
                className="bg-primary-500 hover:bg-primary-600 text-white text-sm px-5 py-2 rounded transition-colors"
              >
                読込
              </button>
              {pasteText.trim() && (
                <span className="text-xs text-gray-400">{parseNames(pasteText).length} 件のアイテム名を抽出</span>
              )}
            </div>
          </div>
        )}

        {hasFilter && (
          <div className="flex items-center justify-between border-t border-surface-border pt-3">
            <p className="text-xs text-gray-400">
              絞り込み中:
              {appliedName && <span className="text-gray-200 ml-1">「{appliedName}」</span>}
              {appliedNames.length > 0 && <span className="text-gray-200 ml-1">アイテム名 {appliedNames.length} 件</span>}
            </p>
            <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-white transition-colors">
              クリア
            </button>
          </div>
        )}
      </div>

      {/* ソート + 件数 */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">
          {data ? `${data.total} 件` : ''}
        </p>
        <div className="flex items-center gap-2">
          <ListDisplayToggle mode={displayMode} onChange={changeDisplayMode} />
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1) }}
            className="bg-surface-card border border-surface-border rounded px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-primary-500"
          >
            <option value="newest">新着順</option>
            <option value="name_asc">あいうえお順</option>
            <option value="price_desc">買取価格が高い順</option>
            <option value="price_asc">買取価格が安い順</option>
          </select>
        </div>
      </div>

      {/* 一覧（出品一覧と同じテーブルレイアウト。買取は装備性能・確認ステータスは表示しない） */}
      <div className="listing-table-container bg-surface-card border border-surface-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              {/* シンプル表示は列が少ないぶんアイテム名に幅を寄せる（他列は内容ぶんだけに縮める） */}
              <th className={`text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider ${compact ? 'w-full' : ''}`}>アイテム</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">価格</th>
              <th className={`text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider ${compact ? 'w-px whitespace-nowrap' : 'listing-col-wide'}`}>
                {compact ? 'サーバー' : '取引'}
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {loading ? (
              <tr><td colSpan={4} className="text-center py-16 text-gray-500">読み込み中...</td></tr>
            ) : !data || data.data.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-16 text-gray-500">該当する買取はありません。</td></tr>
            ) : (
              data.data.map((b) => {
                const daysLeft = Math.ceil((new Date(b.expires_at).getTime() - Date.now()) / 86400000)
                const isOpen = tradeTarget?.id === b.id
                const isDone = requestedIds.has(b.id)
                const isMine = user?.id === b.user_id
                const isCompleted = b.status === 'completed'
                return (
                  <React.Fragment key={b.id}>
                  <tr className={`transition-colors ${isOpen ? 'bg-primary-500/5' : 'hover:bg-surface-border/20'}`}>
                    {/* アイテム名・種別（シンプル表示ではアイテム名のみ） */}
                    <td className="px-4 py-3">
                      {!compact && <p className="text-xs text-gray-400">{b.item.category.name}</p>}
                      {compact ? compactItemName(b.item) : <p className="text-white font-medium">{b.item.name}</p>}
                      {!compact && b.item.official_url && (
                        <div className="mt-1">
                          <OfficialDbLink url={b.item.official_url} />
                        </div>
                      )}
                    </td>

                    {/* 買取希望価格・期限 */}
                    <td className="px-3 py-3 text-right">
                      {b.trade_type === 'auction' ? (
                        <>
                          <p className="text-[10px] text-amber-300/80 leading-none">現在価格</p>
                          <p className="text-base font-bold text-amber-300 whitespace-nowrap">{(b.current_price ?? b.price).toLocaleString()} {b.currency}</p>
                          {!compact && (
                            <p className="text-[10px] text-gray-500 whitespace-nowrap">入札 {b.bid_count ?? 0}件{b.buyout_price != null && ` ・即決 ${b.buyout_price.toLocaleString()}`}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] text-emerald-400/80 leading-none">買取希望</p>
                          <p className="text-base font-bold text-emerald-400 whitespace-nowrap">{b.price.toLocaleString()} {b.currency}</p>
                        </>
                      )}
                      {!compact && (
                        <p
                          title={deadlineTooltip(b.expires_at, b.trade_type === 'auction')}
                          className={`text-xs mt-0.5 whitespace-nowrap ${b.trade_type === 'auction' ? 'cursor-help' : ''} ${daysLeft <= 3 ? 'text-orange-400' : 'text-gray-500'}`}
                        >
                          {remainingLabel(b.expires_at, b.trade_type === 'auction')}
                        </p>
                      )}
                    </td>

                    {/* 取引方法・サーバー（シンプル表示は取引可能サーバーのみ） */}
                    <td className={`px-4 py-3 ${compact ? 'w-px whitespace-nowrap' : 'listing-col-wide min-w-[8.5rem]'}`}>
                      {!compact && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          <span className={`px-2 py-0.5 rounded whitespace-nowrap ${b.trade_type === 'auction' ? 'text-[10px] bg-amber-900/40 border border-amber-600/40 text-amber-200' : 'text-xs bg-surface text-gray-300'}`}>
                            {b.trade_type === 'auction' ? '🔨 オークション' : TRADE_TYPE_LABEL[b.trade_type]}
                          </span>
                        </div>
                      )}
                      {/* シンプル表示はサーバー頭文字バッジのみを横一列に並べる（改行させない） */}
                      <div className={compact ? 'flex items-center gap-1' : 'flex flex-col gap-1'}>
                        {b.servers.map((s) => (
                          <div key={s.server} className="flex items-center gap-1.5">
                            <span title={s.server} className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SERVER_COLORS[s.server]}`}>
                              {s.server[0]}
                            </span>
                            {!compact && s.character?.character_name && (
                              <span className="text-xs text-gray-300 whitespace-nowrap">{s.character.character_name}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* 操作 */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isMine || isCompleted ? (
                        <div className={actionsClass}>
                          {isCompleted && <span className="text-xs text-primary-500">✓ 取引完了</span>}
                          {detailOrMarket(b)}
                        </div>
                      ) : isDone ? (
                        <div className={actionsClass}>
                          <span className="text-xs text-primary-500">✓ 申出済み</span>
                          {detailOrMarket(b)}
                        </div>
                      ) : (
                        <div className={actionsClass}>
                          {user && !!user.email_verified_at && (
                            <button
                              onClick={() => setTradeTarget(isOpen ? null : b)}
                              className={`inline-flex items-center justify-center w-20 text-xs whitespace-nowrap px-2.5 py-1 rounded border transition-colors ${
                                isOpen
                                  ? 'border-gray-500 text-gray-400 hover:text-white'
                                  : 'border-primary-500/60 bg-primary-500/10 text-primary-400 hover:bg-primary-500/20'
                              }`}
                            >
                              {isOpen ? 'キャンセル' : '取引'}
                            </button>
                          )}
                          {detailOrMarket(b)}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* 買取コメント行（コメントがある場合のみ、アイテム行の直下に表示。シンプル表示では出さない） */}
                  {b.comment && !compact && (
                    <tr className={`!border-t-0 ${isOpen ? 'bg-primary-500/5' : ''}`}>
                      <td colSpan={4} className="px-4 pb-3 pt-0">
                        <p className="text-xs text-gray-300 bg-surface rounded px-3 py-2 whitespace-pre-wrap break-words">
                          <span className="text-gray-500 mr-1.5 select-none">💬</span>
                          {b.comment}
                        </p>
                      </td>
                    </tr>
                  )}

                  {/* 売却申し出パネル（行を展開） */}
                  {isOpen && (
                    <tr key={`panel-${b.id}`}>
                      <td colSpan={4} className="px-4 pb-4">
                        <TradeRequestPanel
                          source={b}
                          kind="buy_request"
                          onComplete={() => {
                            setRequestedIds((prev) => new Set([...prev, b.id]))
                            setTradeTarget(null)
                          }}
                          onCancel={() => setTradeTarget(null)}
                          onUnavailable={() => {
                            setTradeTarget(null)
                            setTradeError('この買取は取り下げ、または取引成立済みのため取引できませんでした。')
                            // 一覧を再取得して無効になった買取を除外する
                            fetchList()
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
      {data && data.last_page > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-sm px-3 py-1.5 rounded border border-surface-border text-gray-300 disabled:opacity-40 hover:bg-surface-border transition-colors"
          >
            前へ
          </button>
          <span className="text-sm text-gray-400">{data.current_page} / {data.last_page}</span>
          <button
            onClick={() => setPage((p) => Math.min(data.last_page, p + 1))}
            disabled={page >= data.last_page}
            className="text-sm px-3 py-1.5 rounded border border-surface-border text-gray-300 disabled:opacity-40 hover:bg-surface-border transition-colors"
          >
            次へ
          </button>
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

      {/* アイテム詳細ポップアップ（シンプル表示のアイテム名クリック・PCのみ） */}
      {detailItemId != null && (
        <ItemDetailModal itemId={detailItemId} onClose={() => setDetailItemId(null)} />
      )}
    </div>
  )
}
