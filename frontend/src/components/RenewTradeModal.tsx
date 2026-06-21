import { useState } from 'react'
import { createPortal } from 'react-dom'
import { listingsApi } from '../api/listings'
import { buyRequestsApi } from '../api/buyRequests'
import type { Listing, BuyRequest, TradeType } from '../types'
import { TRADE_TYPE_LABEL } from '../utils/constants'

interface Props {
  kind: 'listing' | 'buy_request'
  record: Listing | BuyRequest
  onClose: () => void
  onSaved: (updated: Listing | BuyRequest) => void
}

// 期限切れの出品・買取を再出品／再登録するモーダル。
// 価格を設定し直し（現在価格を初期値に表示）、即決／交渉可を選び直して期限を更新する。
export default function RenewTradeModal({ kind, record, onClose, onSaved }: Props) {
  const [price, setPrice] = useState<string>(String(record.price))
  const [tradeType, setTradeType] = useState<TradeType>(record.trade_type)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const actionLabel = kind === 'listing' ? '再出品' : '再登録'

  const save = async () => {
    const priceNum = Number(price)
    if (!Number.isInteger(priceNum) || priceNum < 1) {
      setError('価格は1以上の整数で入力してください。')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = { price: priceNum, trade_type: tradeType }
      const res =
        kind === 'listing'
          ? await listingsApi.renew(record.id, payload)
          : await buyRequestsApi.renew(record.id, payload)
      onSaved(res.data as Listing | BuyRequest)
      onClose()
    } catch {
      setError(`${actionLabel}に失敗しました。時間をおいて再度お試しください。`)
    } finally {
      setSaving(false)
    }
  }

  // 親の space-y-* による margin-top で fixed オーバーレイが下にずれ、上端（ヘッダー）が暗幕で覆われないのを防ぐため body 直下に描画する
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white">価格を設定してください</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{record.item?.name} を{actionLabel}します</p>
        </div>

        {/* 価格 */}
        <div>
          <p className="text-sm text-gray-300 mb-1.5">
            {kind === 'listing' ? '販売価格' : '買取価格'}（現在 {record.price.toLocaleString()} {record.currency}）
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
            />
            <span className="text-sm text-gray-400 shrink-0">{record.currency}</span>
          </div>
        </div>

        {/* 取引方法 */}
        <div>
          <p className="text-sm text-gray-300 mb-1.5">取引方法</p>
          <div className="flex gap-2">
            {(['fixed', 'negotiable'] as const).map((t) => (
              <label
                key={t}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer text-sm transition-colors ${
                  tradeType === t
                    ? 'border-primary-500 bg-primary-900/20 text-gray-200'
                    : 'border-surface-border text-gray-400 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="renew-trade-type"
                  checked={tradeType === t}
                  onChange={() => setTradeType(t)}
                  className="accent-primary-500"
                />
                {TRADE_TYPE_LABEL[t]}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-white px-4 py-2 rounded transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-2 rounded-md transition-colors"
          >
            {saving ? '処理中...' : actionLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
