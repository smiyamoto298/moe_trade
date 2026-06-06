import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { listingsApi } from '../api/listings'
import { itemsApi } from '../api/items'
import { chatApi } from '../api/chat'
import { USE_MOCK } from '../api/mock'
import UnverifiedBadge from '../components/UnverifiedBadge'
import ChatThread from '../components/ChatThread'
import PriceAnalyticsComp from '../components/PriceAnalytics'
import type { Listing, TradeChat, Server, ItemPriceAnalytics } from '../types'
import { TRADE_TYPE_LABEL, SERVER_COLORS, SPECIAL_CONDITIONS, BASE_STAT_LABELS } from '../utils/constants'

// モック時の「自分」の設定
const MOCK_USER_ID = 99
// const MOCK_IS_OWNER = false  // true にすると出品者視点で確認できる
const MOCK_IS_OWNER = true  // true にすると出品者視点で確認できる

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [listing, setListing] = useState<Listing | null>(null)
  const [analytics, setAnalytics] = useState<ItemPriceAnalytics | null>(null)

  // チャット関連
  const [chatOpen, setChatOpen] = useState(false)
  const [activeChat, setActiveChat] = useState<TradeChat | null>(null)
  const [allChats, setAllChats] = useState<TradeChat[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [showServerSelect, setShowServerSelect] = useState(false)

  useEffect(() => {
    if (!id) return
    listingsApi.get(Number(id)).then((r) => {
      setListing(r.data)
      itemsApi.priceAnalytics(r.data.item.id).then((a) => setAnalytics(a.data))
    })
  }, [id])

  if (!listing) return <div className="text-center py-20 text-gray-500">読み込み中...</div>

  const { item } = listing
  const daysLeft = Math.ceil(
    (new Date(listing.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  // モック時: 出品者かどうかの判定（本番はuseAuthで判定）
  const isOwner = USE_MOCK ? MOCK_IS_OWNER : false

  // サーバー選択後にチャットを開く
  const handleOpenChat = async (server: Server) => {
    setChatLoading(true)
    setShowServerSelect(false)
    try {
      const res = await chatApi.getOrCreate(listing.id, server)
      setActiveChat(res.data)
      setChatOpen(true)
    } finally {
      setChatLoading(false)
    }
  }

  // 出品者用：全チャット一覧を開く
  const handleOpenAllChats = async () => {
    setChatLoading(true)
    try {
      const res = await chatApi.listByListing(listing.id)
      setAllChats(res.data)
      setChatOpen(true)
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {item.verified_status === 'unverified' && <UnverifiedBadge />}

      {/* アイテム情報 */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-6">
        <p className="text-sm text-gray-400 mb-1">{item.category.name}</p>
        <h1 className="text-2xl font-bold text-white mb-4">{item.name}</h1>

        {item.description && (
          <p className="text-sm text-gray-300 mb-4">{item.description}</p>
        )}

        {Object.keys(item.base_stats).length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">追加効果</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(item.base_stats).map(([key, val]) => (
                <div key={key} className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                  <span className="text-gray-400">{BASE_STAT_LABELS[key] ?? key}</span>
                  <span className="text-white font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {item.bonus_effects.length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">付加効果</h2>
            <div className="space-y-1">
              {item.bonus_effects.map((e) => (
                <div key={e.id} className="bg-surface rounded px-3 py-2 text-sm">
                  <span className="text-primary-500 font-medium">{e.effect_name}</span>
                  {e.values.length > 0 && (
                    <span className="text-gray-300 ml-2">
                      {e.values.map((v, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-gray-600 mx-1">/</span>}
                          {v.label && <span className="text-gray-400">{v.label} </span>}
                          <span>{v.value}{v.value_unit === '%' ? '%' : v.value_unit === 'x' ? '倍' : v.value_unit === 'per_min' ? '/min' : ''}</span>
                        </span>
                      ))}
                    </span>
                  )}
                  {e.description && (
                    <span className="text-gray-500 ml-2 text-xs">— {e.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {item.special_conditions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.special_conditions.map((c) => (
              <span
                key={c}
                title={SPECIAL_CONDITIONS[c]}
                className="bg-red-900/40 border border-red-700/50 text-red-300 text-xs px-2 py-0.5 rounded"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 出品情報 */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">出品情報</h2>
        <div className="flex items-end gap-2 mb-4">
          <span className="text-3xl font-bold text-primary-500">{listing.price.toLocaleString()}</span>
          <span className="text-gray-400 mb-1">{listing.currency}</span>
          <span className="ml-2 bg-surface text-gray-300 text-sm px-2 py-0.5 rounded">
            {TRADE_TYPE_LABEL[listing.trade_type]}
          </span>
        </div>

        {listing.comment && (
          <p className="text-sm text-gray-300 mb-4 bg-surface rounded p-3">{listing.comment}</p>
        )}

        <div className="space-y-2 mb-4">
          <h3 className="text-xs text-gray-400">取引可能サーバー・連絡先</h3>
          {listing.servers.map((s) => (
            <div
              key={s.server}
              className={`flex items-center gap-3 px-3 py-2 rounded ${SERVER_COLORS[s.server]}`}
            >
              <span className="font-medium w-20">{s.server}</span>
              <span className="text-white">{s.character?.character_name}</span>
            </div>
          ))}
        </div>

        <p className={`text-sm mb-5 ${daysLeft <= 3 ? 'text-orange-400' : 'text-gray-500'}`}>
          出品期限まで残り{daysLeft}日
        </p>

        {/* チャットボタン */}
        {isOwner ? (
          <button
            onClick={handleOpenAllChats}
            disabled={chatLoading}
            className="w-full flex items-center justify-center gap-2 bg-surface hover:bg-surface-border border border-surface-border text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <span>💬</span>
            取引チャット一覧を見る
            {allChats.length > 0 && (
              <span className="bg-primary-500 text-white text-xs rounded-full px-1.5">{allChats.length}</span>
            )}
          </button>
        ) : !user ? (
          <Link
            to="/auth/login"
            className="w-full flex items-center justify-center gap-2 bg-surface hover:bg-surface-border border border-surface-border text-gray-300 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            取引するにはログインが必要です
          </Link>
        ) : (
          <div className="space-y-2">
            {!showServerSelect ? (
              <button
                onClick={() => setShowServerSelect(true)}
                disabled={chatLoading}
                className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>💬</span>
                {chatLoading ? '接続中...' : '取引希望チャットを開く'}
              </button>
            ) : (
              <div className="border border-primary-500/40 bg-primary-500/10 rounded-lg p-4 space-y-3">
                <p className="text-sm text-white font-medium">取引するサーバーを選択してください</p>
                <div className="space-y-2">
                  {listing.servers.map((s) => (
                    <button
                      key={s.server}
                      onClick={() => handleOpenChat(s.server)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors ${SERVER_COLORS[s.server]} border-current/30 hover:opacity-80`}
                    >
                      <span className="font-medium">{s.server}</span>
                      <span className="text-sm opacity-80">連絡先: {s.character?.character_name}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowServerSelect(false)}
                  className="text-xs text-gray-400 hover:text-white w-full text-center"
                >
                  キャンセル
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* チャットパネル */}
      {chatOpen && (
        <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
          {isOwner ? (
            // 出品者：全チャット一覧 + 選択したスレッド
            <div className="grid grid-cols-[240px_1fr] h-[480px]">
              {/* スレッド一覧 */}
              <div className="border-r border-surface-border flex flex-col">
                <p className="text-xs font-semibold text-gray-400 px-3 py-2 border-b border-surface-border">
                  取引希望 ({allChats.length}件)
                </p>
                <div className="overflow-y-auto flex-1">
                  {allChats.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-6">まだチャットはありません</p>
                  ) : (
                    allChats.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setActiveChat(c)}
                        className={`w-full text-left px-3 py-3 border-b border-surface-border hover:bg-surface-border transition-colors ${
                          activeChat?.id === c.id ? 'bg-primary-500/10 border-l-2 border-l-primary-500' : ''
                        }`}
                      >
                        <p className="text-sm text-white font-medium">{c.buyer_character_name}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {c.messages.at(-1)?.message ?? 'メッセージなし'}
                        </p>
                        <p className={`text-xs mt-0.5 ${c.status === 'open' ? 'text-emerald-400' : 'text-gray-500'}`}>
                          {c.status === 'open' ? '交渉中' : 'クローズ'}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* メッセージ */}
              <div>
                {activeChat ? (
                  <ChatThread
                    chat={activeChat}
                    currentUserId={USE_MOCK ? 1 : null}
                    isOwner={true}
                    onDeal={(updatedChats) => {
                      setAllChats(updatedChats)
                      const updated = updatedChats.find((c) => c.id === activeChat.id)
                      if (updated) setActiveChat(updated)
                    }}
                    onStatusChange={(updated) => {
                      setActiveChat(updated)
                      setAllChats((prev) => prev.map((c) => c.id === updated.id ? updated : c))
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-gray-500">
                    左のリストからチャットを選択してください
                  </div>
                )}
              </div>
            </div>
          ) : (
            // 購入希望者：自分のスレッドのみ
            <div className="h-[480px]">
              {activeChat && (
                <ChatThread
                  chat={activeChat}
                  currentUserId={USE_MOCK ? MOCK_USER_ID : null}
                  isOwner={false}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* 価格解析 */}
      {analytics && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5">
            価格データ解析
          </h2>
          <PriceAnalyticsComp analytics={analytics} />
        </div>
      )}
    </div>
  )
}
