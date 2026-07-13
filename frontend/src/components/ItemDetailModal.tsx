import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { itemsApi } from '../api/items'
import ItemInfoCard from './ItemInfoCard'
import HashtagList from './HashtagList'
import UnverifiedBadge from './UnverifiedBadge'
import PriceAnalytics from './PriceAnalyticsAsync'
import Spinner from './Spinner'
import type { Item, ItemPriceAnalytics } from '../types'

interface Props {
  itemId: number
  onClose: () => void
}

/**
 * アイテム詳細をポップアップ表示する共通モーダル。
 * アイテム恒久ページ（/items/:id）と同じ情報（基本情報・ハッシュタグ・相場）を
 * ページ遷移せずに確認できる（アイテムボックスのアイテム名クリックから利用）。
 * ハッシュタグは読み取り専用。編集や取引への導線はフッターのリンクから詳細ページで行う。
 */
export default function ItemDetailModal({ itemId, onClose }: Props) {
  const [item, setItem] = useState<Item | null>(null)
  const [analytics, setAnalytics] = useState<ItemPriceAnalytics | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setItem(null)
    setAnalytics(null)
    setError(false)
    itemsApi.get(itemId)
      .then((r) => {
        setItem(r.data)
        // 相場は取得失敗しても詳細表示は続行する（詳細ページと同じ扱い）
        itemsApi.priceAnalytics(itemId).then((a) => setAnalytics(a.data)).catch(() => {})
      })
      .catch(() => setError(true))
  }, [itemId])

  // 親の space-y-* による margin-top で fixed オーバーレイが下にずれ、上端（ヘッダー）が暗幕で覆われないのを防ぐため body 直下に描画する
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-3xl w-full my-8 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">アイテム詳細</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm" aria-label="閉じる">✕</button>
        </div>

        {error ? (
          <p className="text-center py-10 text-sm text-gray-500">アイテム情報の取得に失敗しました。</p>
        ) : !item ? (
          <Spinner center />
        ) : (
          <>
            {item.verified_status === 'unverified' && <UnverifiedBadge />}

            <ItemInfoCard item={item} />

            {/* ハッシュタグ（読み取り専用。編集は詳細ページで行う） */}
            {item.hashtags && item.hashtags.length > 0 && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ハッシュタグ</h3>
                <HashtagList hashtags={item.hashtags} />
              </div>
            )}

            {/* 相場・取引履歴 */}
            {analytics && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">相場・取引履歴</h3>
                <PriceAnalytics analytics={analytics} itemName={item.name} />
              </div>
            )}

            {/* 詳細ページへの導線。アイテムボックスの未保存編集を失わないよう新しいタブで開く */}
            <div className="flex justify-end">
              <a
                href={`/items/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-500 hover:underline"
                title="アイテム詳細ページを新しいタブで開く"
              >
                詳細ページを開く ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
