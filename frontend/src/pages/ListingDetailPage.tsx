import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePageMeta, SITE_BRAND } from '../hooks/usePageMeta'
import client from '../api/client'
import { listingsApi } from '../api/listings'
import { itemsApi } from '../api/items'
import UnverifiedBadge from '../components/UnverifiedBadge'
import TradeRequestPanel from '../components/TradeRequestPanel'
import PriceAnalyticsComp from '../components/PriceAnalyticsAsync'
import ItemInfoCard from '../components/ItemInfoCard'
import type { Listing, ItemPriceAnalytics, ItemCategory } from '../types'
import { TRADE_TYPE_LABEL, SERVER_COLORS } from '../utils/constants'
import { itemTypeOf } from '../utils/itemType'

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [listing, setListing] = useState<Listing | null>(null)
  const [analytics, setAnalytics] = useState<ItemPriceAnalytics | null>(null)
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [notFound, setNotFound] = useState(false)

  // 取引希望パネル
  const [showTradePanel, setShowTradePanel] = useState(false)
  const [requested, setRequested] = useState(false)

  // アイテム名入りのタイトルで検索エンジンにインデックスさせる。
  // 出品URLは期限切れで消える使い捨てのため、評価はアイテムの恒久ページ(/items/:id)へ canonical で集約する。
  usePageMeta(
    listing ? `${listing.item.name} の出品` : null,
    listing
      ? `${SITE_BRAND}「${listing.item.name}」の出品情報。価格・取引条件を確認して取引チャットで購入できます。`
      : null,
    { canonicalPath: listing ? `/items/${listing.item.id}` : null }
  )

  useEffect(() => {
    if (!id) return
    setNotFound(false)
    setListing(null)
    listingsApi.get(Number(id))
      .then((r) => {
        setListing(r.data)
        itemsApi.priceAnalytics(r.data.item.id).then((a) => setAnalytics(a.data))
        // 装備セットのときだけ、内訳表示用にカテゴリツリーを取得
        if (r.data.item.is_equipment_set) {
          itemsApi.categories().then((c) => setCategories(c.data)).catch(() => {})
        }
      })
      .catch(() => setNotFound(true))
  }, [id])

  // 既に取引希望済みかどうか
  useEffect(() => {
    if (!user || !id) return
    client.get<{ listing_id: number }[] | { data: { listing_id: number }[] }>('/mypage/chats')
      .then((r) => {
        const chats = Array.isArray(r.data) ? r.data : r.data.data
        if (chats.some((c) => c.listing_id === Number(id))) setRequested(true)
      })
      .catch(() => {})
  }, [user, id])

  if (notFound)
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-gray-400">この出品は見つかりませんでした。取り下げ済みか、期限切れの可能性があります。</p>
        <Link to="/listings" className="inline-block text-sm text-primary-500 hover:underline">
          出品一覧へ戻る
        </Link>
      </div>
    )

  if (!listing) return <div className="text-center py-20 text-gray-500">読み込み中...</div>

  const { item } = listing
  const daysLeft = Math.ceil(
    (new Date(listing.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const isOwner = user?.id === listing.user_id
  // テクニックは耐久度の概念がないため「削れあり」は表示しない
  const isTechnique = categories.length > 0 && itemTypeOf(item.category, categories) === 'technique'

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {item.verified_status === 'unverified' && <UnverifiedBadge />}

      {/* アイテム情報 */}
      <ItemInfoCard item={item} tourId="detail-info" />

      {/* このアイテムの相場・他の出品をまとめたアイテムページへ（評価集約のための導線） */}
      <Link to={`/items/${item.id}`} className="block text-sm text-primary-500 hover:underline">
        「{item.name}」の相場・出品をまとめて見る →
      </Link>

      {/* 出品情報 */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">出品情報</h2>
        <div className="flex items-end gap-2 mb-4">
          <span className="text-3xl font-bold text-primary-500">{listing.price.toLocaleString()}</span>
          <span className="text-gray-400 mb-1">{listing.currency}</span>
          <span className="ml-2 bg-surface text-gray-300 text-sm px-2 py-0.5 rounded">
            {TRADE_TYPE_LABEL[listing.trade_type]}
          </span>
          {!isTechnique && listing.is_worn && (
            <span
              title="削れあり（耐久度に削れがある中古品）"
              className="bg-amber-900/30 border border-amber-600/40 text-amber-300 text-sm px-2 py-0.5 rounded"
            >
              ⚠ 削れあり
            </span>
          )}
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

        {/* 取引アクション（チャットのやり取りはマイページで行う） */}
        <div data-tour="detail-trade">
        {isOwner ? (
          <Link
            to="/mypage"
            className="w-full flex items-center justify-center gap-2 bg-surface hover:bg-surface-border border border-surface-border text-gray-300 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            取引チャットはマイページで管理できます →
          </Link>
        ) : !user ? (
          <Link
            to="/auth/login"
            className="w-full flex items-center justify-center gap-2 bg-surface hover:bg-surface-border border border-surface-border text-gray-300 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            取引するにはログインが必要です
          </Link>
        ) : !user.email_verified_at ? (
          <p className="text-center text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-700/40 rounded-lg py-2.5 px-3">
            取引にはメールアドレスの認証が必要です（画面上部から認証メールを再送できます）
          </p>
        ) : listing.status !== 'active' ? (
          <p className="text-center text-sm text-gray-500 py-2">この出品は現在取引できません</p>
        ) : requested ? (
          <Link
            to="/mypage"
            className="w-full flex items-center justify-center gap-2 bg-surface border border-primary-500/40 text-primary-400 py-2.5 rounded-lg text-sm font-medium hover:bg-surface-border transition-colors"
          >
            ✓ 取引希望済み — やり取りはマイページで確認 →
          </Link>
        ) : showTradePanel ? (
          <TradeRequestPanel
            source={listing}
            kind="listing"
            onComplete={() => {
              setShowTradePanel(false)
              setRequested(true)
            }}
            onCancel={() => setShowTradePanel(false)}
          />
        ) : (
          <button
            onClick={() => setShowTradePanel(true)}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span>💬</span>
            取引希望を送る
          </button>
        )}
        </div>
      </div>

      {/* 価格解析 */}
      {analytics && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5">
            価格データ解析
          </h2>
          <PriceAnalyticsComp analytics={analytics} itemName={listing.item.name} />
        </div>
      )}
    </div>
  )
}
