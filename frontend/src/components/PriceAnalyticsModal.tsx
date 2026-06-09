import { useEffect, useState } from 'react'
import { itemsApi } from '../api/items'
import PriceAnalytics from './PriceAnalytics'
import Spinner from './Spinner'
import type { ItemPriceAnalytics } from '../types'

interface Props {
  itemId: number
  itemName: string
  onClose: () => void
}

/** 価格データ解析をポップアップ表示する共通モーダル */
export default function PriceAnalyticsModal({ itemId, itemName, onClose }: Props) {
  const [analytics, setAnalytics] = useState<ItemPriceAnalytics | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setAnalytics(null)
    setError(false)
    itemsApi.priceAnalytics(itemId)
      .then((r) => setAnalytics(r.data))
      .catch(() => setError(true))
  }, [itemId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-3xl w-full my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white">価格データ解析</h2>
            <p className="text-sm text-gray-400">{itemName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">✕</button>
        </div>

        {error ? (
          <p className="text-center py-10 text-sm text-gray-500">相場データの取得に失敗しました。</p>
        ) : !analytics ? (
          <Spinner center />
        ) : (
          <PriceAnalytics analytics={analytics} />
        )}
      </div>
    </div>
  )
}
