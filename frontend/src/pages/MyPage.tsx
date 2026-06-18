import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listingsApi } from '../api/listings'
import { buyRequestsApi } from '../api/buyRequests'
import client from '../api/client'
import { charactersApi } from '../api/characters'
import { mockChats, MOCK_MY_USER_ID, MOCK_MY_LISTING_IDS, USE_MOCK } from '../api/mock'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { useDialog } from '../contexts/DialogContext'
import { useTour } from '../tours/TourContext'
import ChatThread from '../components/ChatThread'
import EditTradeModal from '../components/EditTradeModal'
import type { Listing, BuyRequest, TradeChat, Server } from '../types'
import { SERVERS } from '../types'
import { TRADE_TYPE_LABEL, SERVER_COLORS } from '../utils/constants'

type Tab = 'listings' | 'buying' | 'buy_requests' | 'selling'

type SourceRecord = Listing | BuyRequest

export default function MyPage() {
  const { user, refresh } = useAuth()
  const {
    unreadChatIds, unreadListingIds, unreadBuyRequestIds,
    markAsRead, notifPermission, requestNotifPermission,
  } = useNotification()
  const { confirm, alert } = useDialog()
  const { resetAllTours, startTour } = useTour()

  const [tab, setTab] = useState<Tab>('listings')
  const [editingChars, setEditingChars] = useState(false)
  const [charDraft, setCharDraft] = useState<Record<string, string>>({})
  const [charSaving, setCharSaving] = useState(false)

  const [listings, setListings] = useState<Listing[]>([])
  const [buyingChats, setBuyingChats] = useState<TradeChat[]>([])
  const [sellingChats, setSellingChats] = useState<Record<number, TradeChat[]>>({})

  const [buyRequests, setBuyRequests] = useState<BuyRequest[]>([])
  const [sellingOffers, setSellingOffers] = useState<TradeChat[]>([])
  const [buyRequestChats, setBuyRequestChats] = useState<Record<number, TradeChat[]>>({})

  const [loading, setLoading] = useState(true)
  const [chatsLoading, setChatsLoading] = useState(true)
  const [showMyCompleted, setShowMyCompleted] = useState(false)

  const [activeChat, setActiveChat] = useState<TradeChat | null>(null)
  const [activeSource, setActiveSource] = useState<SourceRecord | null>(null)
  // 出品・買取の編集モーダル対象
  const [editTarget, setEditTarget] = useState<{ kind: 'listing' | 'buy_request'; record: Listing | BuyRequest } | null>(null)

  const startEditChars = () => {
    const draft: Record<string, string> = {}
    SERVERS.forEach((s) => {
      const c = user?.characters?.find((c) => c.server === s)
      draft[s] = c?.character_name ?? ''
    })
    setCharDraft(draft)
    setEditingChars(true)
  }

  const saveChars = async () => {
    setCharSaving(true)
    try {
      for (const server of SERVERS) {
        const name = charDraft[server]?.trim()
        const existing = user?.characters?.find((c) => c.server === server)
        if (name && name !== existing?.character_name) {
          await charactersApi.upsert(server as Server, name)
        } else if (!name && existing) {
          await charactersApi.remove(existing.id)
        }
      }
      await refresh()
      setEditingChars(false)
    } catch {
      await alert('キャラクター情報の保存に失敗しました。時間をおいて再度お試しください。', { title: 'エラー' })
    } finally {
      setCharSaving(false)
    }
  }

  const handleToggleDefault = async (id: number, value: boolean) => {
    setCharSaving(true)
    try {
      await charactersApi.setDefault(id, value)
      await refresh()
    } catch {
      await alert('デフォルトキャラの保存に失敗しました。時間をおいて再度お試しください。', { title: 'エラー' })
    } finally {
      setCharSaving(false)
    }
  }

  const fetchMyListings = () => {
    setLoading(true)
    Promise.all([
      client.get<{ data: Listing[] }>('/mypage/listings').then((r) => setListings(r.data.data)),
      client.get<{ data: BuyRequest[] }>('/mypage/buy-requests').then((r) => setBuyRequests(r.data.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }

  const fetchChats = async (silent = false) => {
    if (!silent) setChatsLoading(true)
    try {
      if (USE_MOCK) {
        setBuyingChats(mockChats.filter((c) => c.buyer_id === MOCK_MY_USER_ID))
        const sellingMap: Record<number, TradeChat[]> = {}
        for (const lid of MOCK_MY_LISTING_IDS) {
          sellingMap[lid] = mockChats.filter((c) => c.listing_id === lid && c.buyer_id !== MOCK_MY_USER_ID)
        }
        setSellingChats(sellingMap)
        return
      }
      const [buyRes, sellRes, offerRes, brChatRes] = await Promise.all([
        client.get<TradeChat[]>('/mypage/chats'),
        client.get<Record<string, TradeChat[]>>('/mypage/selling-chats'),
        client.get<TradeChat[]>('/mypage/selling-offers').catch(() => ({ data: [] as TradeChat[] })),
        client.get<Record<string, TradeChat[]>>('/mypage/buy-request-chats').catch(() => ({ data: {} as Record<string, TradeChat[]> })),
      ])
      setBuyingChats(buyRes.data)
      const sellingMap: Record<number, TradeChat[]> = {}
      for (const [listingId, chats] of Object.entries(sellRes.data)) {
        sellingMap[Number(listingId)] = chats
      }
      setSellingChats(sellingMap)

      setSellingOffers(offerRes.data)
      const brMap: Record<number, TradeChat[]> = {}
      for (const [brId, chats] of Object.entries(brChatRes.data)) {
        brMap[Number(brId)] = chats
      }
      setBuyRequestChats(brMap)
    } finally {
      if (!silent) setChatsLoading(false)
    }
  }

  useEffect(() => { fetchMyListings(); fetchChats() }, [])

  useEffect(() => {
    const knownIds = new Set([
      ...Object.values(sellingChats).flat().map((c) => c.id),
      ...buyingChats.map((c) => c.id),
      ...Object.values(buyRequestChats).flat().map((c) => c.id),
      ...sellingOffers.map((c) => c.id),
    ])
    const hasUnknownUnread = [...unreadChatIds].some((id) => !knownIds.has(id))
    if (hasUnknownUnread && !chatsLoading) {
      fetchChats(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadChatIds])

  useEffect(() => {
    if (activeChat && unreadChatIds.has(activeChat.id)) {
      markAsRead(activeChat.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadChatIds, activeChat])

  // 順番待ち（新規の取引希望など）は未読通知に出ないため、未読変化だけでは一覧に反映されない。
  // チャット一覧を定期的に再取得して、画面更新なしで順番待ちが表示されるようにする。
  useEffect(() => {
    if (USE_MOCK) return
    const timer = setInterval(() => { fetchChats(true) }, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [actioningId, setActioningId] = useState<number | null>(null)

  const handleRenew = async (id: number) => {
    if (actioningId) return
    setActioningId(id)
    try { await listingsApi.renew(id); fetchMyListings() } finally { setActioningId(null) }
  }

  const handleCancel = async (id: number) => {
    if (actioningId) return
    if (!(await confirm('出品を取り下げますか？', { title: '出品の取り下げ', confirmLabel: '取り下げる', danger: true }))) return
    setActioningId(id)
    try { await listingsApi.cancel(id); fetchMyListings() } finally { setActioningId(null) }
  }

  const handleRenewBuy = async (id: number) => {
    if (actioningId) return
    setActioningId(id)
    try { await buyRequestsApi.renew(id); fetchMyListings() } finally { setActioningId(null) }
  }

  const handleCancelBuy = async (id: number) => {
    if (actioningId) return
    if (!(await confirm('買取を取り下げますか？', { title: '買取の取り下げ', confirmLabel: '取り下げる', danger: true }))) return
    setActioningId(id)
    try { await buyRequestsApi.cancel(id); fetchMyListings() } finally { setActioningId(null) }
  }

  const openChat = (chat: TradeChat, source?: SourceRecord) => {
    setActiveChat(chat)
    setActiveSource(source ?? null)
    markAsRead(chat.id)
  }

  const switchTab = (t: Tab) => { setTab(t); setActiveChat(null); setActiveSource(null) }

  const myUserId = USE_MOCK ? MOCK_MY_USER_ID : user?.id ?? null

  const active = listings
    .filter((l) => ['active', 'completed', 'deal_failed'].includes(l.status))
    .sort((a, b) => (unreadListingIds.has(b.id) ? 1 : 0) - (unreadListingIds.has(a.id) ? 1 : 0))
  const expired = listings.filter((l) => l.status === 'expired')
  const activeBuy = buyRequests
    .filter((b) => ['active', 'completed', 'deal_failed'].includes(b.status))
    .sort((a, b) => (unreadBuyRequestIds.has(b.id) ? 1 : 0) - (unreadBuyRequestIds.has(a.id) ? 1 : 0))
  const expiredBuy = buyRequests.filter((b) => b.status === 'expired')

  const chatStatusLabel = (s: TradeChat['status']) =>
    s === 'open' ? '交渉中' : s === 'deal' ? '取引成立' : s === 'deal_failed' ? '不成立' : '見送り'
  const chatStatusColor = (s: TradeChat['status']) =>
    s === 'open' ? 'text-emerald-400' : s === 'deal' ? 'text-primary-500' : s === 'deal_failed' ? 'text-red-400' : 'text-gray-500'

  // チャットリストを「未読を上 → 更新が新しい順」で並べる
  const sortChats = (chats: TradeChat[]) =>
    [...chats].sort((a, b) => {
      const ua = unreadChatIds.has(a.id) ? 1 : 0
      const ub = unreadChatIds.has(b.id) ? 1 : 0
      if (ua !== ub) return ub - ua
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

  // owner 視点：取引希望チャットを「先着順（先頭→順番待ち）→ クローズ済み」で並べる
  const orderOwnerChats = (chats: TradeChat[]) => {
    const open = chats
      .filter((c) => c.status === 'open')
      .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0))
    const closed = chats
      .filter((c) => c.status !== 'open')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return [...open, ...closed]
  }

  const openChatCount = (chats: TradeChat[]) => chats.filter((c) => c.status === 'open').length

  // buyer 視点：自分のチャットの順番待ちバッジ（待ち行列が2人以上のときだけ表示）
  const queueBadge = (c: TradeChat) => {
    if (c.status !== 'open' || c.queue_position == null || (c.queue_total ?? 0) <= 1) return null
    // 進行中の取引成立があるとき（他のユーザーと取引成立中）は順番待ち表示しない
    const src = c.listing ?? c.buy_request
    if (src?.status === 'completed') return null
    return (
      <span className="text-xs text-orange-300 bg-orange-900/20 border border-orange-700/30 rounded px-1.5 py-0.5 shrink-0">
        ⏳ 順番待ち {c.queue_position}番目 / 全{c.queue_total}人
      </span>
    )
  }

  // owner 視点：取引希望チャット1件分の行を描画する（先頭=操作可 / 2番目以降=匿名ロック）
  const renderSellerChatRow = (c: TradeChat, source: SourceRecord) => {
    if (c.is_locked) {
      return (
        <div
          key={c.id}
          className="w-full flex items-center gap-3 px-3 py-2 rounded border border-surface-border/60 bg-surface/40 cursor-not-allowed select-none"
          title="先頭の取引を見送ると、次の取引希望が表示されます"
        >
          <span className="shrink-0">🔒</span>
          <span className="text-sm text-gray-400 flex-1">順番待ち（{c.queue_position}番目）</span>
          <span className="text-xs text-gray-500 shrink-0">先頭を見送ると表示されます</span>
        </div>
      )
    }
    const isUnread = unreadChatIds.has(c.id)
    return (
      <button
        key={c.id}
        onClick={() => openChat(c, source)}
        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded border transition-colors ${activeChat?.id === c.id ? 'border-primary-500 bg-primary-500/10' : isUnread ? 'border-red-500/50 bg-red-900/10 hover:bg-red-900/20' : 'border-surface-border hover:bg-surface-border'}`}
      >
        {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
        <span className="text-sm text-white flex-1">{c.buyer_character_name || c.buyer?.email || '不明'}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SERVER_COLORS[c.server]}`}>{c.server}</span>
        <span className="text-xs text-gray-400 truncate max-w-[160px]">{c.messages?.at(-1)?.message ?? 'メッセージなし'}</span>
        <span className={`text-xs shrink-0 ${chatStatusColor(c.status)}`}>{chatStatusLabel(c.status)}</span>
      </button>
    )
  }

  const isOwnerTab = tab === 'listings' || tab === 'buy_requests'
  const chatKind: 'listing' | 'buy_request' = (tab === 'buy_requests' || tab === 'selling') ? 'buy_request' : 'listing'

  const hasSellingOfferUnread = sellingOffers.some((c) => unreadChatIds.has(c.id))

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-white">マイページ</h1>

        <div className="flex items-center gap-2">
          <Link
            to="/mypage/items"
            className="text-xs bg-surface-card border border-surface-border hover:border-primary-500 text-gray-300 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
          >
            📦 マイペ整理
          </Link>
          <button
            onClick={async () => {
              const ok = await confirm('各ページの操作案内（初回ポップアップ）をもう一度表示するようにします。よろしいですか？')
              if (!ok) return
              resetAllTours()
              startTour('mypage')
            }}
            className="text-xs bg-surface-card border border-surface-border hover:border-primary-500 text-gray-300 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
          >
            ❔ 操作案内をリセット
          </button>
          {notifPermission === 'default' && (
            <button
              onClick={requestNotifPermission}
              className="text-xs bg-surface-card border border-surface-border hover:border-primary-500 text-gray-300 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
            >
              🔔 ブラウザ通知を有効にする
            </button>
          )}
          {notifPermission === 'granted' && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">🔔 通知ON</span>
          )}
          {notifPermission === 'denied' && (
            <span className="text-xs text-gray-500">🔕 通知がブロックされています</span>
          )}
        </div>
      </div>

      {/* 期限切れの自分の出品・買取がある場合の通知バナー。
          再出品・再登録を促し、ボタンで該当タブ（出品中／買取中）の期限切れ一覧へ誘導する。 */}
      {(expired.length > 0 || expiredBuy.length > 0) && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4 flex flex-wrap items-center gap-3">
          <span className="text-amber-300 text-lg shrink-0" aria-hidden>⚠️</span>
          <div className="flex-1 min-w-[12rem]">
            <p className="text-sm font-semibold text-amber-200">期限切れの取引があります</p>
            <p className="text-xs text-amber-100/80 mt-0.5">
              {[
                expired.length > 0 ? `出品 ${expired.length}件` : null,
                expiredBuy.length > 0 ? `買取 ${expiredBuy.length}件` : null,
              ].filter(Boolean).join('・')}
              {' '}が期限切れです。再出品・再登録ができます。
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {expired.length > 0 && (
              <button
                onClick={() => switchTab('listings')}
                className="text-xs bg-amber-500/80 hover:bg-amber-500 text-white px-3 py-1.5 rounded transition-colors"
              >
                出品を確認
              </button>
            )}
            {expiredBuy.length > 0 && (
              <button
                onClick={() => switchTab('buy_requests')}
                className="text-xs bg-amber-500/80 hover:bg-amber-500 text-white px-3 py-1.5 rounded transition-colors"
              >
                買取を確認
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-surface-card border border-surface-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400">キャラクター</h2>
          {!editingChars ? (
            <button onClick={startEditChars} className="text-xs text-primary-500 hover:underline">編集</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditingChars(false)} className="text-xs text-gray-400 hover:text-white">キャンセル</button>
              <button onClick={saveChars} disabled={charSaving} className="text-xs bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors">
                {charSaving ? '保存中...' : '保存'}
              </button>
            </div>
          )}
        </div>

        {editingChars ? (
          <div className="space-y-2">
            {SERVERS.map((server) => (
              <div key={server} className="flex items-center gap-3 border border-surface-border rounded px-3 py-2">
                <span className={`text-xs font-medium w-16 shrink-0 ${SERVER_COLORS[server].split(' ')[1]}`}>{server}</span>
                <input
                  type="text"
                  placeholder="キャラクター名（空欄で削除）"
                  value={charDraft[server] ?? ''}
                  onChange={(e) => setCharDraft((p) => ({ ...p, [server]: e.target.value }))}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {SERVERS.map((server) => {
              const char = user?.characters?.find((c) => c.server === server)
              return (
                <div key={server} className={`flex items-center gap-3 px-3 py-2 rounded ${char ? SERVER_COLORS[server] : 'border border-dashed border-surface-border'}`}>
                  <span className={`text-xs font-medium w-16 shrink-0 ${!char ? 'text-gray-600' : ''}`}>{server}</span>
                  <span className={`text-sm flex-1 ${char ? 'text-white' : 'text-gray-600'}`}>{char ? char.character_name : '未登録'}</span>
                  {char && (
                    <div className="flex items-center gap-1.5 shrink-0" title="出品・買取登録時に既定で選択するサーバー（複数可）">
                      <span className="text-xs text-gray-300">デフォルト</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!char.is_default}
                        disabled={charSaving}
                        onClick={() => handleToggleDefault(char.id, !char.is_default)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${char.is_default ? 'bg-primary-500' : 'bg-surface-border'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${char.is_default ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div data-tour="mypage-tabs" className="flex flex-wrap border-b border-surface-border">
        <button
          data-tour="mypage-tab-listings"
          onClick={() => switchTab('listings')}
          className={`relative px-4 py-2 text-sm font-medium transition-colors ${tab === 'listings' ? 'text-white border-b-2 border-primary-500' : 'text-gray-400 hover:text-white'}`}
        >
          出品中
          {expired.length > 0 && (
            <span className="ml-1.5 align-middle text-[10px] font-medium text-amber-300 bg-amber-900/30 border border-amber-700/40 rounded px-1 py-px">期限切れ{expired.length}</span>
          )}
          {unreadListingIds.size > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{unreadListingIds.size}</span>
          )}
        </button>
        <button
          data-tour="mypage-tab-buying"
          onClick={() => switchTab('buying')}
          className={`relative px-4 py-2 text-sm font-medium transition-colors ${tab === 'buying' ? 'text-white border-b-2 border-primary-500' : 'text-gray-400 hover:text-white'}`}
        >
          取引希望
          {buyingChats.some((c) => unreadChatIds.has(c.id)) && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">!</span>
          )}
        </button>
        <button
          data-tour="mypage-tab-buyreq"
          onClick={() => switchTab('buy_requests')}
          className={`relative px-4 py-2 text-sm font-medium transition-colors ${tab === 'buy_requests' ? 'text-white border-b-2 border-primary-500' : 'text-gray-400 hover:text-white'}`}
        >
          買取中
          {expiredBuy.length > 0 && (
            <span className="ml-1.5 align-middle text-[10px] font-medium text-amber-300 bg-amber-900/30 border border-amber-700/40 rounded px-1 py-px">期限切れ{expiredBuy.length}</span>
          )}
          {unreadBuyRequestIds.size > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{unreadBuyRequestIds.size}</span>
          )}
        </button>
        <button
          data-tour="mypage-tab-selling"
          onClick={() => switchTab('selling')}
          className={`relative px-4 py-2 text-sm font-medium transition-colors ${tab === 'selling' ? 'text-white border-b-2 border-primary-500' : 'text-gray-400 hover:text-white'}`}
        >
          販売希望
          {hasSellingOfferUnread && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">!</span>
          )}
        </button>
      </div>

      {/* 1fr は minmax(auto,1fr) 扱いになり、truncate（nowrap）な長文の固有最小幅で
          左カラムが広がって右の420pxパネルがページ外へはみ出すため minmax(0,1fr) にする */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
        <div className="space-y-4">
          {tab === 'listings' && (
            <>
              <div className="space-y-2">
                {loading ? (
                  <p className="text-sm text-gray-500">読み込み中...</p>
                ) : active.length === 0 ? (
                  <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg">
                    <p className="text-gray-500 text-sm">出品中のアイテムはありません</p>
                    <Link to="/listings/new" className="mt-2 inline-block text-sm text-primary-500 hover:underline">出品する</Link>
                  </div>
                ) : (
                  <>
                    {active.some((l) => l.status === 'deal_failed' || (l.status === 'completed' && (sellingChats[l.id] ?? []).some((c) => c.seller_completed))) && (
                      <label className="flex items-center gap-1.5 cursor-pointer self-end">
                        <input type="checkbox" checked={showMyCompleted} onChange={(e) => setShowMyCompleted(e.target.checked)} className="accent-primary-500 w-3 h-3" />
                        <span className="text-xs text-gray-500">完了・不成立も表示</span>
                      </label>
                    )}
                    {active.map((l) => {
                      const daysLeft = Math.ceil((new Date(l.expires_at).getTime() - Date.now()) / 86400000)
                      const chats = sellingChats[l.id] ?? []
                      const hasUnread = unreadListingIds.has(l.id)
                      // 完了は「受け渡し完了(seller_completed)」で判定。取引成立しただけ（受け渡し未）は畳まない。不成立は畳む。
                      const concluded = l.status === 'deal_failed' || (l.status === 'completed' && chats.some((c) => c.seller_completed))
                      // 未読メッセージがある場合は畳まず表示する
                      if (concluded && !showMyCompleted && !unreadListingIds.has(l.id)) return null
                      return (
                        <div key={l.id} className={`bg-surface-card border rounded-lg p-4 ${hasUnread ? 'border-red-500/60' : 'border-surface-border'}`}>
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-400">{l.item.category.name}</p>
                              <p className="font-medium text-white truncate">{l.item.name}</p>
                              <p className="text-sm text-primary-500 mt-0.5">
                                {l.price.toLocaleString()} {l.currency}
                                <span className="text-gray-400 ml-2">{TRADE_TYPE_LABEL[l.trade_type]}</span>
                              </p>
                            </div>
                            <div className="text-right shrink-0 space-y-1.5">
                              {l.status === 'completed' && <span className="text-xs text-primary-500">✓ 取引完了</span>}
                              {l.status === 'deal_failed' && <span className="text-xs text-red-400">✕ 不成立</span>}
                              {l.status === 'active' && <p className={`text-xs ${daysLeft <= 3 ? 'text-orange-400' : 'text-gray-500'}`}>残り{daysLeft}日</p>}
                              <div className="flex gap-1.5">
                                {l.status === 'active' && <>
                                  <button onClick={() => setEditTarget({ kind: 'listing', record: l })} className="text-xs bg-surface-border hover:bg-surface-border/80 text-gray-300 px-2 py-1 rounded transition-colors">編集</button>
                                  <button onClick={() => handleRenew(l.id)} disabled={actioningId === l.id} className="text-xs bg-surface-border hover:bg-surface-border/80 disabled:opacity-50 text-gray-300 px-2 py-1 rounded transition-colors">{actioningId === l.id ? '処理中...' : '期限更新'}</button>
                                  <button onClick={() => handleCancel(l.id)} disabled={actioningId === l.id} className="text-xs bg-red-900/40 hover:bg-red-900/70 disabled:opacity-50 text-red-300 px-2 py-1 rounded transition-colors">{actioningId === l.id ? '処理中...' : '取り下げ'}</button>
                                </>}
                              </div>
                            </div>
                          </div>

                          {chats.length > 0 && (
                            <div className="mt-3 border-t border-surface-border pt-3 space-y-1.5">
                              <p className="text-xs text-gray-400">
                                取引希望チャット ({chats.length}件)
                                {openChatCount(chats) > 1 && (
                                  <span className="text-gray-500"> ・先着順で先頭の1件のみ対応できます（見送ると次の方が表示されます）</span>
                                )}
                              </p>
                              {orderOwnerChats(chats).map((c) => renderSellerChatRow(c, l))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>

              {expired.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">期限切れ（{expired.length}件）</p>
                  <div className="space-y-2">
                    {expired.map((l) => (
                      <div key={l.id} className="bg-surface-card border border-surface-border rounded-lg p-4 flex items-center gap-4 opacity-60">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400">{l.item.category.name}</p>
                          <p className="font-medium text-white truncate">{l.item.name}</p>
                          <p className="text-sm text-gray-400">{l.price.toLocaleString()} {l.currency}</p>
                        </div>
                        <button onClick={() => handleRenew(l.id)} disabled={actioningId === l.id} className="text-xs bg-primary-500/80 hover:bg-primary-500 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors">{actioningId === l.id ? '処理中...' : '再出品'}</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'buying' && (
            <div className="space-y-2">
              {chatsLoading ? (
                <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg"><p className="text-gray-500 text-sm">読み込み中...</p></div>
              ) : buyingChats.length === 0 ? (
                <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg">
                  <p className="text-gray-500 text-sm">取引希望中のチャットはありません</p>
                  <Link to="/listings" className="mt-2 inline-block text-sm text-primary-500 hover:underline">出品一覧を見る</Link>
                </div>
              ) : (
                <>
                  {buyingChats.some((c) => c.buyer_completed || c.status === 'deal_failed' || c.status === 'declined') && (
                    <label className="flex items-center gap-1.5 cursor-pointer self-end">
                      <input type="checkbox" checked={showMyCompleted} onChange={(e) => setShowMyCompleted(e.target.checked)} className="accent-primary-500 w-3 h-3" />
                      <span className="text-xs text-gray-500">完了・不成立も表示</span>
                    </label>
                  )}
                  {sortChats(buyingChats.filter((c) => showMyCompleted || unreadChatIds.has(c.id) || !(c.buyer_completed || c.status === 'deal_failed' || c.status === 'declined'))).map((c) => {
                    const chatListing = (c as any).listing
                    const sellerChar = chatListing?.servers?.find((s: any) => s.server === c.server)?.character?.character_name
                    const isUnread = unreadChatIds.has(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => openChat(c, chatListing ?? undefined)}
                        className={`w-full text-left bg-surface-card border rounded-lg p-4 transition-colors ${activeChat?.id === c.id ? 'border-primary-500 bg-primary-500/10' : isUnread ? 'border-red-500/50 bg-red-900/10 hover:bg-red-900/20' : 'border-surface-border hover:border-gray-500'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                              <p className="text-sm font-medium text-white truncate">{chatListing?.item?.name ?? `出品 #${c.listing_id}`}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SERVER_COLORS[c.server]}`}>{c.server}</span>
                              {sellerChar && <span className="text-xs text-gray-300">{sellerChar}</span>}
                              {queueBadge(c)}
                            </div>
                            <p className="text-xs text-gray-400 truncate">{c.messages?.at(-1)?.message ?? 'メッセージなし'}</p>
                          </div>
                          <span className={`text-xs shrink-0 ${chatStatusColor(c.status)}`}>{chatStatusLabel(c.status)}</span>
                        </div>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {tab === 'buy_requests' && (
            <>
              <div className="space-y-2">
                {loading ? (
                  <p className="text-sm text-gray-500">読み込み中...</p>
                ) : activeBuy.length === 0 ? (
                  <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg">
                    <p className="text-gray-500 text-sm">登録中の買取はありません</p>
                    <Link to="/buy-requests/new" className="mt-2 inline-block text-sm text-primary-500 hover:underline">買取する</Link>
                  </div>
                ) : (
                  <>
                    {activeBuy.some((b) => b.status === 'deal_failed' || (b.status === 'completed' && (buyRequestChats[b.id] ?? []).some((c) => c.seller_completed))) && (
                      <label className="flex items-center gap-1.5 cursor-pointer self-end">
                        <input type="checkbox" checked={showMyCompleted} onChange={(e) => setShowMyCompleted(e.target.checked)} className="accent-primary-500 w-3 h-3" />
                        <span className="text-xs text-gray-500">完了・不成立も表示</span>
                      </label>
                    )}
                    {activeBuy.map((b) => {
                      const daysLeft = Math.ceil((new Date(b.expires_at).getTime() - Date.now()) / 86400000)
                      const chats = buyRequestChats[b.id] ?? []
                      const hasUnread = unreadBuyRequestIds.has(b.id)
                      // 完了は「受け渡し完了(seller_completed)」で判定。取引成立しただけ（受け渡し未）は畳まない。不成立は畳む。
                      const concluded = b.status === 'deal_failed' || (b.status === 'completed' && chats.some((c) => c.seller_completed))
                      // 未読メッセージがある場合は畳まず表示する
                      if (concluded && !showMyCompleted && !unreadBuyRequestIds.has(b.id)) return null
                      return (
                        <div key={b.id} className={`bg-surface-card border rounded-lg p-4 ${hasUnread ? 'border-red-500/60' : 'border-surface-border'}`}>
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-400">{b.item.category.name}</p>
                              <p className="font-medium text-white truncate">{b.item.name}</p>
                              <p className="text-sm text-emerald-400 mt-0.5">
                                買取 {b.price.toLocaleString()} {b.currency}
                                <span className="text-gray-400 ml-2">{TRADE_TYPE_LABEL[b.trade_type]}</span>
                              </p>
                            </div>
                            <div className="text-right shrink-0 space-y-1.5">
                              {b.status === 'completed' && <span className="text-xs text-primary-500">✓ 取引完了</span>}
                              {b.status === 'deal_failed' && <span className="text-xs text-red-400">✕ 不成立</span>}
                              {b.status === 'active' && <p className={`text-xs ${daysLeft <= 3 ? 'text-orange-400' : 'text-gray-500'}`}>残り{daysLeft}日</p>}
                              <div className="flex gap-1.5">
                                {b.status === 'active' && <>
                                  <button onClick={() => setEditTarget({ kind: 'buy_request', record: b })} className="text-xs bg-surface-border hover:bg-surface-border/80 text-gray-300 px-2 py-1 rounded transition-colors">編集</button>
                                  <button onClick={() => handleRenewBuy(b.id)} disabled={actioningId === b.id} className="text-xs bg-surface-border hover:bg-surface-border/80 disabled:opacity-50 text-gray-300 px-2 py-1 rounded transition-colors">{actioningId === b.id ? '処理中...' : '期限更新'}</button>
                                  <button onClick={() => handleCancelBuy(b.id)} disabled={actioningId === b.id} className="text-xs bg-red-900/40 hover:bg-red-900/70 disabled:opacity-50 text-red-300 px-2 py-1 rounded transition-colors">{actioningId === b.id ? '処理中...' : '取り下げ'}</button>
                                </>}
                              </div>
                            </div>
                          </div>

                          {chats.length > 0 && (
                            <div className="mt-3 border-t border-surface-border pt-3 space-y-1.5">
                              <p className="text-xs text-gray-400">
                                売却の申し出チャット ({chats.length}件)
                                {openChatCount(chats) > 1 && (
                                  <span className="text-gray-500"> ・先着順で先頭の1件のみ対応できます（見送ると次の方が表示されます）</span>
                                )}
                              </p>
                              {orderOwnerChats(chats).map((c) => renderSellerChatRow(c, b))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>

              {expiredBuy.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">期限切れ（{expiredBuy.length}件）</p>
                  <div className="space-y-2">
                    {expiredBuy.map((b) => (
                      <div key={b.id} className="bg-surface-card border border-surface-border rounded-lg p-4 flex items-center gap-4 opacity-60">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400">{b.item.category.name}</p>
                          <p className="font-medium text-white truncate">{b.item.name}</p>
                          <p className="text-sm text-gray-400">買取 {b.price.toLocaleString()} {b.currency}</p>
                        </div>
                        <button onClick={() => handleRenewBuy(b.id)} disabled={actioningId === b.id} className="text-xs bg-primary-500/80 hover:bg-primary-500 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors">{actioningId === b.id ? '処理中...' : '再登録'}</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'selling' && (
            <div className="space-y-2">
              {chatsLoading ? (
                <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg"><p className="text-gray-500 text-sm">読み込み中...</p></div>
              ) : sellingOffers.length === 0 ? (
                <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg">
                  <p className="text-gray-500 text-sm">売却を申し出た買取はありません</p>
                  <Link to="/buy-requests" className="mt-2 inline-block text-sm text-primary-500 hover:underline">買取一覧を見る</Link>
                </div>
              ) : (
                <>
                  {sellingOffers.some((c) => c.buyer_completed || c.status === 'deal_failed' || c.status === 'declined') && (
                    <label className="flex items-center gap-1.5 cursor-pointer self-end">
                      <input type="checkbox" checked={showMyCompleted} onChange={(e) => setShowMyCompleted(e.target.checked)} className="accent-primary-500 w-3 h-3" />
                      <span className="text-xs text-gray-500">完了・不成立も表示</span>
                    </label>
                  )}
                  {sortChats(sellingOffers.filter((c) => showMyCompleted || unreadChatIds.has(c.id) || !(c.buyer_completed || c.status === 'deal_failed' || c.status === 'declined'))).map((c) => {
                    const br = (c as any).buy_request
                    const buyerChar = br?.servers?.find((s: any) => s.server === c.server)?.character?.character_name
                    const isUnread = unreadChatIds.has(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => openChat(c, br ?? undefined)}
                        className={`w-full text-left bg-surface-card border rounded-lg p-4 transition-colors ${activeChat?.id === c.id ? 'border-primary-500 bg-primary-500/10' : isUnread ? 'border-red-500/50 bg-red-900/10 hover:bg-red-900/20' : 'border-surface-border hover:border-gray-500'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                              <p className="text-sm font-medium text-white truncate">
                                {br?.item?.name ?? `買取 #${c.buy_request_id}`}
                                {br && <span className="text-emerald-400 ml-2">買取 {br.price?.toLocaleString?.() ?? br.price} {br.currency}</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SERVER_COLORS[c.server]}`}>{c.server}</span>
                              {buyerChar && <span className="text-xs text-gray-300">{buyerChar}</span>}
                              {queueBadge(c)}
                            </div>
                            <p className="text-xs text-gray-400 truncate">{c.messages?.at(-1)?.message ?? 'メッセージなし'}</p>
                          </div>
                          <span className={`text-xs shrink-0 ${chatStatusColor(c.status)}`}>{chatStatusLabel(c.status)}</span>
                        </div>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>

        {activeChat && (
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden sticky top-20">
            {activeSource && (
              <div className="px-4 py-2 border-b border-surface-border bg-surface">
                <p className="text-xs text-gray-400">{activeSource.item?.category?.name}</p>
                <p className="text-sm text-white font-medium truncate">{activeSource.item?.name}</p>
              </div>
            )}
            <div className="h-[440px]">
              <ChatThread
                chat={activeChat}
                currentUserId={myUserId}
                isOwner={isOwnerTab}
                kind={chatKind}
                source={activeSource}
                onDeal={(updatedChats) => {
                  const updated = updatedChats.find((c) => c.id === activeChat.id)
                  if (updated) setActiveChat({ ...activeChat, ...updated })
                  fetchChats(true)
                }}
                onStatusChange={(updated) => {
                  setActiveChat((prev) => (prev ? { ...prev, ...updated } : updated))
                  fetchChats(true)
                }}
                onListingsChanged={() => fetchMyListings()}
                hasWaitingNext={(() => {
                  if (!activeSource) return false
                  const group = chatKind === 'buy_request'
                    ? (buyRequestChats[activeSource.id] ?? [])
                    : (sellingChats[activeSource.id] ?? [])
                  // このチャット以外に順番待ち（open）が残っているか
                  return group.some((c) => c.status === 'open' && c.id !== activeChat.id)
                })()}
              />
            </div>
          </div>
        )}
      </div>

      {editTarget && (
        <EditTradeModal
          kind={editTarget.kind}
          record={editTarget.record}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            // 更新レスポンスは item.category 等を含まないため、編集した項目だけをパッチする
            if (editTarget.kind === 'listing') {
              const u = updated as Listing
              setListings((prev) =>
                prev.map((l) =>
                  l.id === u.id ? { ...l, trade_type: u.trade_type, comment: u.comment, is_worn: u.is_worn, is_dyed: u.is_dyed, servers: u.servers } : l
                )
              )
            } else {
              const u = updated as BuyRequest
              setBuyRequests((prev) =>
                prev.map((b) =>
                  b.id === u.id ? { ...b, trade_type: u.trade_type, comment: u.comment, servers: u.servers } : b
                )
              )
            }
          }}
        />
      )}
    </div>
  )
}
