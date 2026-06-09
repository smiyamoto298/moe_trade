import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listingsApi } from '../api/listings'
import client from '../api/client'
import { charactersApi } from '../api/characters'
import { mockChats, MOCK_MY_USER_ID, MOCK_MY_LISTING_IDS, USE_MOCK } from '../api/mock'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { useDialog } from '../contexts/DialogContext'
import ChatThread from '../components/ChatThread'
import type { Listing, TradeChat, Server } from '../types'
import { SERVERS } from '../types'
import { TRADE_TYPE_LABEL, SERVER_COLORS } from '../utils/constants'

type Tab = 'listings' | 'buying'

export default function MyPage() {
  const { user, refresh } = useAuth()
  const { unreadChatIds, unreadListingIds, hasBuyerUnread, markAsRead, notifPermission, requestNotifPermission } = useNotification()
  const { confirm, alert } = useDialog()

  const [tab, setTab] = useState<Tab>('listings')
  const [editingChars, setEditingChars] = useState(false)
  const [charDraft, setCharDraft] = useState<Record<string, string>>({})
  const [charSaving, setCharSaving] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [buyingChats, setBuyingChats] = useState<TradeChat[]>([])
  const [sellingChats, setSellingChats] = useState<Record<number, TradeChat[]>>({})
  const [loading, setLoading] = useState(true)
  const [chatsLoading, setChatsLoading] = useState(true)
  const [showMyCompleted, setShowMyCompleted] = useState(false)

  // 選択中チャット
  const [activeChat, setActiveChat] = useState<TradeChat | null>(null)
  const [activeListing, setActiveListing] = useState<Listing | null>(null)

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
      // AuthContext の user を再取得して表示へ反映する
      await refresh()
      setEditingChars(false)
    } catch {
      await alert('キャラクター情報の保存に失敗しました。時間をおいて再度お試しください。', { title: 'エラー' })
    } finally {
      setCharSaving(false)
    }
  }

  const fetchMyListings = () => {
    setLoading(true)
    client.get<{ data: Listing[] }>('/mypage/listings')
      .then((r) => setListings(r.data.data))
      .finally(() => setLoading(false))
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
      const [buyRes, sellRes] = await Promise.all([
        client.get<TradeChat[]>('/mypage/chats'),
        client.get<Record<string, TradeChat[]>>('/mypage/selling-chats'),
      ])
      setBuyingChats(buyRes.data)
      // キーを数値に変換して setSellingChats
      const sellingMap: Record<number, TradeChat[]> = {}
      for (const [listingId, chats] of Object.entries(sellRes.data)) {
        sellingMap[Number(listingId)] = chats
      }
      setSellingChats(sellingMap)
    } finally {
      if (!silent) setChatsLoading(false)
    }
  }

  useEffect(() => { fetchMyListings(); fetchChats() }, [])

  // 通知サマリーの未読に「一覧に無いチャット」が含まれていたら、
  // 新規取引希望が届いたとみなしてチャット一覧を静かに再取得する
  useEffect(() => {
    const knownIds = new Set([
      ...Object.values(sellingChats).flat().map((c) => c.id),
      ...buyingChats.map((c) => c.id),
    ])
    const hasUnknownUnread = [...unreadChatIds].some((id) => !knownIds.has(id))
    if (hasUnknownUnread && !chatsLoading) {
      fetchChats(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadChatIds])

  // 表示中のチャットに新着が届いた場合、閲覧中なので自動的に既読化する。
  // （openChat 時の markAsRead だけでは、表示中に届いたメッセージで
  //   再び未読扱いになり、アイコンが消えなくなる）
  useEffect(() => {
    if (activeChat && unreadChatIds.has(activeChat.id)) {
      markAsRead(activeChat.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadChatIds, activeChat])

  const [actioningId, setActioningId] = useState<number | null>(null)

  const handleRenew = async (id: number) => {
    if (actioningId) return
    setActioningId(id)
    try {
      await listingsApi.renew(id)
      fetchMyListings()
    } finally {
      setActioningId(null)
    }
  }

  const handleCancel = async (id: number) => {
    if (actioningId) return
    if (!(await confirm('出品を取り下げますか？', { title: '出品の取り下げ', confirmLabel: '取り下げる', danger: true }))) return
    setActioningId(id)
    try {
      await listingsApi.cancel(id)
      fetchMyListings()
    } finally {
      setActioningId(null)
    }
  }

  const openChat = (chat: TradeChat, listing?: Listing) => {
    setActiveChat(chat)
    setActiveListing(listing ?? null)
    markAsRead(chat.id)
  }

  const myUserId = USE_MOCK ? MOCK_MY_USER_ID : user?.id ?? null

  const active = listings.filter((l) => ['active', 'completed', 'deal_failed'].includes(l.status))
  const expired = listings.filter((l) => l.status === 'expired')

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-white">マイページ</h1>

        {/* ブラウザ通知 */}
        <div className="flex items-center gap-2">
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

      {/* キャラクター情報 */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400">キャラクター</h2>
          {!editingChars ? (
            <button
              onClick={startEditChars}
              className="text-xs text-primary-500 hover:underline"
            >
              編集
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditingChars(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                キャンセル
              </button>
              <button
                onClick={saveChars}
                disabled={charSaving}
                className="text-xs bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors"
              >
                {charSaving ? '保存中...' : '保存'}
              </button>
            </div>
          )}
        </div>

        {editingChars ? (
          <div className="space-y-2">
            {SERVERS.map((server) => (
              <div key={server} className="flex items-center gap-3 border border-surface-border rounded px-3 py-2">
                <span className={`text-xs font-medium w-16 shrink-0 ${SERVER_COLORS[server].split(' ')[1]}`}>
                  {server}
                </span>
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
                  <span className={`text-xs font-medium w-16 shrink-0 ${!char ? 'text-gray-600' : ''}`}>
                    {server}
                  </span>
                  <span className={`text-sm ${char ? 'text-white' : 'text-gray-600'}`}>
                    {char ? char.character_name : '未登録'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* タブ */}
      <div className="flex border-b border-surface-border">
        <button
          onClick={() => { setTab('listings'); setActiveChat(null); setActiveListing(null) }}
          className={`relative px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'listings'
              ? 'text-white border-b-2 border-primary-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          出品中
          {unreadListingIds.size > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {unreadListingIds.size}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTab('buying'); setActiveChat(null); setActiveListing(null) }}
          className={`relative px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'buying'
              ? 'text-white border-b-2 border-primary-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          取引希望
          {hasBuyerUnread && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">!</span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
        {/* 左：リスト */}
        <div className="space-y-4">
          {tab === 'listings' ? (
            <>
              {/* 出品中 */}
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
                  {active.some((l) => {
                    const chats = sellingChats[l.id] ?? []
                    return l.status === 'completed' && chats.some((c) => c.seller_completed)
                  }) && (
                    <label className="flex items-center gap-1.5 cursor-pointer self-end">
                      <input type="checkbox" checked={showMyCompleted} onChange={(e) => setShowMyCompleted(e.target.checked)} className="accent-primary-500 w-3 h-3" />
                      <span className="text-xs text-gray-500">受け渡し完了を表示</span>
                    </label>
                  )}
                  {active.map((l) => {
                    const daysLeft = Math.ceil((new Date(l.expires_at).getTime() - Date.now()) / 86400000)
                    const chats = sellingChats[l.id] ?? []
                    const hasUnread = unreadListingIds.has(l.id)
                    // 取引完了かつ自分側受け渡し完了済みはデフォルト非表示
                    const sellerDone = l.status === 'completed' && chats.some((c) => c.seller_completed)
                    if (sellerDone && !showMyCompleted) return null
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
                                <button onClick={() => handleRenew(l.id)} disabled={actioningId === l.id} className="text-xs bg-surface-border hover:bg-surface-border/80 disabled:opacity-50 text-gray-300 px-2 py-1 rounded transition-colors">{actioningId === l.id ? '処理中...' : '期限更新'}</button>
                                <button onClick={() => handleCancel(l.id)} disabled={actioningId === l.id} className="text-xs bg-red-900/40 hover:bg-red-900/70 disabled:opacity-50 text-red-300 px-2 py-1 rounded transition-colors">{actioningId === l.id ? '処理中...' : '取り下げ'}</button>
                              </>}
                            </div>
                          </div>
                        </div>

                        {/* チャット一覧 */}
                        {chats.length > 0 && (
                          <div className="mt-3 border-t border-surface-border pt-3 space-y-1.5">
                            <p className="text-xs text-gray-400">取引希望チャット ({chats.length}件)</p>
                            {chats.map((c) => {
                              const isUnread = unreadChatIds.has(c.id)
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => openChat(c, l)}
                                  className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded border transition-colors ${
                                    activeChat?.id === c.id
                                      ? 'border-primary-500 bg-primary-500/10'
                                      : isUnread
                                      ? 'border-red-500/50 bg-red-900/10 hover:bg-red-900/20'
                                      : 'border-surface-border hover:bg-surface-border'
                                  }`}
                                >
                                  {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                                  <span className="text-sm text-white flex-1">{c.buyer_character_name || c.buyer?.email || '不明'}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SERVER_COLORS[c.server]}`}>{c.server}</span>
                                  <span className="text-xs text-gray-400 truncate max-w-[160px]">
                                    {c.messages?.at(-1)?.message ?? 'メッセージなし'}
                                  </span>
                                  <span className={`text-xs shrink-0 ${
                                    c.status === 'open' ? 'text-emerald-400' :
                                    c.status === 'deal' ? 'text-primary-500' :
                                    c.status === 'deal_failed' ? 'text-red-400' : 'text-gray-500'
                                  }`}>
                                    {c.status === 'open' ? '交渉中' : c.status === 'deal' ? '取引成立' : c.status === 'deal_failed' ? '不成立' : '見送り'}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  </>
                )}
              </div>

              {/* 期限切れ */}
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
          ) : (
            /* 取引希望タブ */
            <div className="space-y-2">
              {chatsLoading ? (
                <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg">
                  <p className="text-gray-500 text-sm">読み込み中...</p>
                </div>
              ) : buyingChats.length === 0 ? (
                <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg">
                  <p className="text-gray-500 text-sm">取引希望中のチャットはありません</p>
                  <Link to="/listings" className="mt-2 inline-block text-sm text-primary-500 hover:underline">出品一覧を見る</Link>
                </div>
              ) : (
                <>
                  {buyingChats.some((c) => c.buyer_completed) && (
                    <label className="flex items-center gap-1.5 cursor-pointer self-end">
                      <input type="checkbox" checked={showMyCompleted} onChange={(e) => setShowMyCompleted(e.target.checked)} className="accent-primary-500 w-3 h-3" />
                      <span className="text-xs text-gray-500">受け渡し完了を表示</span>
                    </label>
                  )}
                  {buyingChats.filter((c) => showMyCompleted || !c.buyer_completed).map((c) => {
                  const chatListing = (c as any).listing
                  const sellerChar = chatListing?.servers?.find((s: any) => s.server === c.server)?.character?.character_name
                  const isUnread = unreadChatIds.has(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => openChat(c, undefined)}
                      className={`w-full text-left bg-surface-card border rounded-lg p-4 transition-colors ${
                        activeChat?.id === c.id
                          ? 'border-primary-500 bg-primary-500/10'
                          : isUnread
                          ? 'border-red-500/50 bg-red-900/10 hover:bg-red-900/20'
                          : 'border-surface-border hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                            <p className="text-sm font-medium text-white truncate">
                              {chatListing?.item?.name ?? `出品 #${c.listing_id}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SERVER_COLORS[c.server]}`}>{c.server}</span>
                            {sellerChar && (
                              <span className="text-xs text-gray-300">{sellerChar}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate">
                            {c.messages?.at(-1)?.message ?? 'メッセージなし'}
                          </p>
                        </div>
                        <span className={`text-xs shrink-0 ${
                          c.status === 'open' ? 'text-emerald-400' :
                          c.status === 'deal' ? 'text-primary-500' :
                          c.status === 'deal_failed' ? 'text-red-400' : 'text-gray-500'
                        }`}>
                          {c.status === 'open' ? '交渉中' : c.status === 'deal' ? '取引成立' : c.status === 'deal_failed' ? '不成立' : '見送り'}
                        </span>
                      </div>
                    </button>
                  )
                  })}
                </>
              )}
            </div>
          )}
        </div>

        {/* 右：チャットパネル */}
        {activeChat && (
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden sticky top-20">
            {activeListing && (
              <div className="px-4 py-2 border-b border-surface-border bg-surface">
                <p className="text-xs text-gray-400">{activeListing.item.category.name}</p>
                <p className="text-sm text-white font-medium truncate">{activeListing.item.name}</p>
              </div>
            )}
            <div className="h-[440px]">
              <ChatThread
                chat={activeChat}
                currentUserId={myUserId}
                isOwner={tab === 'listings'}
                onDeal={(updatedChats) => {
                  const updated = updatedChats.find((c) => c.id === activeChat.id)
                  if (updated) setActiveChat(updated)
                  setSellingChats((prev) => {
                    const next = { ...prev }
                    const lid = activeChat.listing_id
                    next[lid] = updatedChats.filter((c) => c.listing_id === lid)
                    return next
                  })
                  fetchChats()
                }}
                onStatusChange={(updated) => {
                  setActiveChat(updated)
                  setSellingChats((prev) => {
                    const next = { ...prev }
                    const lid = updated.listing_id
                    next[lid] = (next[lid] ?? []).map((c) => c.id === updated.id ? updated : c)
                    return next
                  })
                  setBuyingChats((prev) => prev.map((c) => c.id === updated.id ? updated : c))
                }}
                onListingsChanged={() => fetchMyListings()}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
