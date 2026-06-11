import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import client from '../api/client'
import { buyRequestsApi } from '../api/buyRequests'
import { itemsApi } from '../api/items'
import UnverifiedBadge from '../components/UnverifiedBadge'
import TradeRequestPanel from '../components/TradeRequestPanel'
import PriceAnalyticsComp from '../components/PriceAnalytics'
import EquipmentSetBreakdown from '../components/EquipmentSetBreakdown'
import type { BuyRequest, ItemPriceAnalytics } from '../types'
import { TRADE_TYPE_LABEL, SERVER_COLORS, SPECIAL_CONDITIONS, BASE_STAT_LABELS } from '../utils/constants'

export default function BuyRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [buyRequest, setBuyRequest] = useState<BuyRequest | null>(null)
  const [analytics, setAnalytics] = useState<ItemPriceAnalytics | null>(null)
  const [notFound, setNotFound] = useState(false)

  const [showTradePanel, setShowTradePanel] = useState(false)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    if (!id) return
    setNotFound(false)
    setBuyRequest(null)
    buyRequestsApi.get(Number(id))
      .then((r) => {
        setBuyRequest(r.data)
        itemsApi.priceAnalytics(r.data.item.id).then((a) => setAnalytics(a.data))
      })
      .catch(() => setNotFound(true))
  }, [id])

  // 既に売却を申し出済みかどうか（買取への取引希望 = selling-offers）
  useEffect(() => {
    if (!user || !id) return
    client.get<{ buy_request_id: number }[]>('/mypage/selling-offers')
      .then((r) => {
        const chats = Array.isArray(r.data) ? r.data : []
        if (chats.some((c) => c.buy_request_id === Number(id))) setRequested(true)
      })
      .catch(() => {})
  }, [user, id])

  if (notFound)
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-gray-400">この買取は見つかりませんでした。取り下げ済みか、期限切れの可能性があります。</p>
        <Link to="/buy-requests" className="inline-block text-sm text-primary-500 hover:underline">
          買取一覧へ戻る
        </Link>
      </div>
    )

  if (!buyRequest) return <div className="text-center py-20 text-gray-500">読み込み中...</div>

  const { item } = buyRequest
  const daysLeft = Math.ceil(
    (new Date(buyRequest.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const isOwner = user?.id === buyRequest.user_id

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {item.verified_status === 'unverified' && <UnverifiedBadge />}

      {/* アイテム情報 */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6">
        <p className="text-sm text-gray-400 mb-1">{item.category.name}</p>
        <h1 className="text-2xl font-bold text-white mb-4">{item.name}</h1>

        {item.description && (
          <p className="text-sm text-gray-300 mb-4">{item.description}</p>
        )}

        {item.is_equipment_set && <EquipmentSetBreakdown members={item.set_members} />}

        {(item.placement || (item.asset_width && item.asset_height) || (item.storage_count ?? 0) > 0 || item.special_function) && (
          <div className="mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">アセット情報</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {item.placement && (
                <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                  <span className="text-gray-400">設置個所</span>
                  <span className="text-white font-medium">{item.placement}</span>
                </div>
              )}
              {item.asset_width && item.asset_height ? (
                <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                  <span className="text-gray-400">サイズ</span>
                  <span className="text-white font-medium">{item.asset_width}×{item.asset_height}</span>
                </div>
              ) : null}
              {(item.storage_count ?? 0) > 0 && (
                <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                  <span className="text-gray-400">ストレージ</span>
                  <span className="text-white font-medium">{item.storage_count}</span>
                </div>
              )}
              {item.special_function && (
                <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                  <span className="text-gray-400">特殊機能</span>
                  <span className="text-white font-medium">{item.special_function}</span>
                </div>
              )}
            </div>
          </div>
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

      {/* 買取情報 */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">買取情報</h2>
        <div className="flex items-end gap-2 mb-4">
          <span className="text-xs text-emerald-400/80 mb-1.5">買取希望</span>
          <span className="text-3xl font-bold text-emerald-400">{buyRequest.price.toLocaleString()}</span>
          <span className="text-gray-400 mb-1">{buyRequest.currency}</span>
          <span className="ml-2 bg-surface text-gray-300 text-sm px-2 py-0.5 rounded">
            {TRADE_TYPE_LABEL[buyRequest.trade_type]}
          </span>
        </div>

        {buyRequest.comment && (
          <p className="text-sm text-gray-300 mb-4 bg-surface rounded p-3">{buyRequest.comment}</p>
        )}

        <div className="space-y-2 mb-4">
          <h3 className="text-xs text-gray-400">取引可能サーバー・連絡先</h3>
          {buyRequest.servers.map((s) => (
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
          買取期限まで残り{daysLeft}日
        </p>

        {/* 取引アクション（チャットのやり取りはマイページで行う） */}
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
        ) : buyRequest.status !== 'active' ? (
          <p className="text-center text-sm text-gray-500 py-2">この買取は現在取引できません</p>
        ) : requested ? (
          <Link
            to="/mypage"
            className="w-full flex items-center justify-center gap-2 bg-surface border border-primary-500/40 text-primary-400 py-2.5 rounded-lg text-sm font-medium hover:bg-surface-border transition-colors"
          >
            ✓ 売却を申し出済み — やり取りはマイページで確認 →
          </Link>
        ) : showTradePanel ? (
          <TradeRequestPanel
            source={buyRequest}
            kind="buy_request"
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
            売却を申し出る
          </button>
        )}
      </div>

      {/* 価格解析 */}
      {analytics && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5">
            価格データ解析
          </h2>
          <PriceAnalyticsComp analytics={analytics} />
        </div>
      )}
    </div>
  )
}
