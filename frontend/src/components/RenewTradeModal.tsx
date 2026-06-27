import { useState } from 'react'
import { createPortal } from 'react-dom'
import { listingsApi } from '../api/listings'
import { buyRequestsApi } from '../api/buyRequests'
import type { Listing, BuyRequest, TradeType } from '../types'
import { TRADE_TYPE_LABEL, defaultAuctionDeadline } from '../utils/constants'
import DeadlineInput from './DeadlineInput'

interface Props {
  kind: 'listing' | 'buy_request'
  record: Listing | BuyRequest
  onClose: () => void
  onSaved: (updated: Listing | BuyRequest) => void
}

// 期限切れの出品・買取を再出品／再登録するモーダル。
// 価格を設定し直し（現在価格を初期値に表示）、即決／交渉可を選び直して期限を更新する。
// オークション（入札ゼロで終了）は最低/最高取引価格を有利な向きに変更し、即決価格・期限日を再設定する。
export default function RenewTradeModal({ kind, record, onClose, onSaved }: Props) {
  const isAuction = record.trade_type === 'auction'
  const isListing = kind === 'listing' // 出品=最低取引価格を下げる / 買取=最高取引価格を上げる
  const [price, setPrice] = useState<string>(isAuction ? '' : String(record.price))
  const [buyoutPrice, setBuyoutPrice] = useState<string>('')
  const [expiresAt, setExpiresAt] = useState<string>(isAuction ? defaultAuctionDeadline() : '')
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
    if (isAuction) {
      // 出品は下げる / 買取は上げる
      if (isListing && priceNum >= record.price) { setError('再出品では最低取引価格を下げてください。'); return }
      if (!isListing && priceNum <= record.price) { setError('再登録では最高取引価格を上げてください。'); return }
      if (!expiresAt) { setError('期限日を選択してください。'); return }
      if (new Date(expiresAt).getTime() <= Date.now()) { setError('期限日は現在時刻より後に設定してください。'); return }
      const buyoutNum = buyoutPrice ? Number(buyoutPrice) : null
      if (buyoutNum != null) {
        if (isListing && buyoutNum <= priceNum) { setError('即決価格は最低取引価格より高く設定してください。'); return }
        if (!isListing && buyoutNum >= priceNum) { setError('即決価格は最高取引価格より低く設定してください。'); return }
      }
    }
    setSaving(true)
    setError('')
    try {
      const payload = isAuction
        ? { price: priceNum, buyout_price: buyoutPrice ? Number(buyoutPrice) : null, expires_at: new Date(expiresAt).toISOString() }
        : { price: priceNum, trade_type: tradeType }
      const res =
        kind === 'listing'
          ? await listingsApi.renew(record.id, payload)
          : await buyRequestsApi.renew(record.id, payload)
      onSaved(res.data as Listing | BuyRequest)
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? `${actionLabel}に失敗しました。時間をおいて再度お試しください。`)
    } finally {
      setSaving(false)
    }
  }

  // 親の space-y-* による margin-top で fixed オーバーレイが下にずれ、上端（ヘッダー）が暗幕で覆われないのを防ぐため body 直下に描画する
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white">{isAuction ? 'オークションを再出品' : '価格を設定してください'}</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{record.item?.name} を{actionLabel}します</p>
        </div>

        {/* 価格（オークションは最低/最高取引価格を有利な向きに変更） */}
        <div>
          <p className="text-sm text-gray-300 mb-1.5">
            {isAuction
              ? `${isListing ? '最低取引価格' : '最高取引価格'}（現在 ${record.price.toLocaleString()} ${record.currency}）`
              : `${kind === 'listing' ? '販売価格' : '買取価格'}（現在 ${record.price.toLocaleString()} ${record.currency}）`}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={price}
              placeholder={isAuction ? (isListing ? `${record.price.toLocaleString()} より低く` : `${record.price.toLocaleString()} より高く`) : ''}
              onChange={(e) => { setPrice(e.target.value); if (error) setError('') }}
              className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
            />
            <span className="text-sm text-gray-400 shrink-0">{record.currency}</span>
          </div>
          {isAuction && (
            <p className="mt-1 text-xs text-amber-300/90">
              {isListing ? '再出品では最低取引価格を下げてください。' : '再登録では最高取引価格を上げてください。'}
            </p>
          )}
        </div>

        {isAuction ? (
          <>
            {/* 即決価格 */}
            <div>
              <p className="text-sm text-gray-300 mb-1.5">即決価格（任意）</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={buyoutPrice}
                  placeholder={isListing ? 'この額以上で即時成立' : 'この額以下で即時成立'}
                  onChange={(e) => { setBuyoutPrice(e.target.value); if (error) setError('') }}
                  className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                />
                <span className="text-sm text-gray-400 shrink-0">{record.currency}</span>
              </div>
            </div>
            {/* 期限日 */}
            <div>
              <p className="text-sm text-gray-300 mb-1.5">期限日</p>
              <DeadlineInput value={expiresAt} onChange={(v) => { setExpiresAt(v); if (error) setError('') }} />
              <p className="mt-1 text-xs text-gray-500">時刻は15分単位で選べます</p>
            </div>
          </>
        ) : (
          /* 取引方法（非オークション） */
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
        )}

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
