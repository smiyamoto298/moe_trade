import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePageMeta, SITE_ORIGIN, SITE_BRAND } from '../hooks/usePageMeta'
import { itemsApi } from '../api/items'
import { useAuth } from '../contexts/AuthContext'
import UnverifiedBadge from '../components/UnverifiedBadge'
import ItemInfoCard from '../components/ItemInfoCard'
import InlineHashtags from '../components/InlineHashtags'
import PriceAnalyticsComp from '../components/PriceAnalyticsAsync'
import type { Item, ItemPriceAnalytics } from '../types'

/**
 * アイテムの恒久公開ページ（/items/:id）。
 *
 * 出品・買取の詳細URLは期限切れで消える使い捨てなのに対し、このページはアイテムが
 * 登録されている限り存在し続ける「アイテム名で検索したときの正規ランディング先」。
 * 出品/買取詳細からは canonical でこのURLへ評価を集約し、sitemap にも（確認済みアイテムを）登録する。
 * これによりアイテム名検索でのヒット・上位化を狙う（design.md「SEO」参照）。
 */
export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [item, setItem] = useState<Item | null>(null)
  const [analytics, setAnalytics] = useState<ItemPriceAnalytics | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    setNotFound(false)
    setItem(null)
    setAnalytics(null)
    itemsApi.get(Number(id))
      .then((r) => {
        setItem(r.data)
        itemsApi.priceAnalytics(r.data.id).then((a) => setAnalytics(a.data)).catch(() => {})
      })
      .catch(() => setNotFound(true))
  }, [id])

  // タイトル・説明・canonical・構造化データ（JSON-LD）でアイテム名検索にヒットさせる。
  // 未確認アイテムは精査前なので noindex でインデックス対象から外す。
  const stats = analytics?.stats
  const priceSummary = stats && stats.deal_count > 0
    ? `相場は平均${stats.avg.toLocaleString()}（${stats.min.toLocaleString()}〜${stats.max.toLocaleString()}）。`
    : ''
  usePageMeta(
    item ? `${item.name} の相場・出品` : null,
    item
      ? `${SITE_BRAND}「${item.name}」（${item.category.name}）の相場・出品・買取情報。${priceSummary}出品中の価格や取引履歴を確認できます。`
      : null,
    {
      canonicalPath: item ? `/items/${item.id}` : null,
      noindex: item ? item.verified_status === 'unverified' : false,
      jsonLd: item
        ? {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: item.name,
            category: item.category.name,
            brand: { '@type': 'Brand', name: 'Master of Epic' },
            url: `${SITE_ORIGIN}/items/${item.id}`,
            ...(item.description ? { description: item.description } : {}),
            ...(item.image_url ? { image: item.image_url } : {}),
          }
        : null,
    }
  )

  if (notFound)
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-gray-400">このアイテムは見つかりませんでした。</p>
        <Link to="/listings" className="inline-block text-sm text-primary-500 hover:underline">
          出品一覧へ戻る
        </Link>
      </div>
    )

  if (!item) return <div className="text-center py-20 text-gray-500">読み込み中...</div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {item.verified_status === 'unverified' && <UnverifiedBadge />}

      {/* アイテム情報 */}
      <ItemInfoCard item={item} />

      {/* ハッシュタグ（固定タグは📌付き。ログインユーザーは通常タグをまとめて編集できる） */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">ハッシュタグ</h2>
        <InlineHashtags
          itemId={item.id}
          hashtags={item.hashtags}
          editable={!!user}
          onSaved={(hashtags) => setItem((prev) => (prev ? { ...prev, hashtags } : prev))}
        />
        {user ? (
          <p className="text-xs text-gray-500">
            タグをクリックすると編集できます（スペース区切りで複数入力）。📌 は運営が設定した固定タグです（アイテム編集画面で設定）。
          </p>
        ) : (
          <p className="text-xs text-gray-500">タグの編集にはログインが必要です。</p>
        )}
      </div>

      {/* 相場・取引履歴（出品・買取・他サイト相場をまとめた価格解析） */}
      {analytics && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">相場・取引履歴</h2>
          <PriceAnalyticsComp analytics={analytics} itemName={item.name} />
        </div>
      )}

      {/* 取引への導線 */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6 flex flex-wrap gap-3">
        <Link
          to="/listings/new"
          className="flex-1 min-w-[10rem] text-center bg-primary-600 hover:bg-primary-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          このアイテムを出品する
        </Link>
        <Link
          to="/buy-requests/new"
          className="flex-1 min-w-[10rem] text-center bg-surface hover:bg-surface-border border border-surface-border text-gray-300 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          買取（買いたい）を登録する
        </Link>
      </div>
    </div>
  )
}
