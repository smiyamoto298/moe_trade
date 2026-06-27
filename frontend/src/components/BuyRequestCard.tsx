import { Link } from 'react-router-dom'
import type { BuyRequest } from '../types'
import { TRADE_TYPE_LABEL, SERVER_COLORS, remainingLabel } from '../utils/constants'
import OfficialDbLink from './OfficialDbLink'

interface Props {
  buyRequest: BuyRequest
}

// 買取一覧では装備性能や確認ステータスは表示せず、アイテム名・取引条件・価格のみを表示する。
export default function BuyRequestCard({ buyRequest }: Props) {
  const daysLeft = Math.ceil(
    (new Date(buyRequest.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const { item } = buyRequest

  return (
    <Link
      to={`/buy-requests/${buyRequest.id}`}
      className="block bg-surface-card border border-surface-border rounded-lg hover:border-primary-500/60 transition-colors"
    >
      <div className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-3">
        {/* 左：アイテム情報 */}
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-xs text-gray-400">{item.category.name}</p>
            <h3 className="font-medium text-white">{item.name}</h3>
            {item.official_url && (
              <div className="mt-0.5">
                <OfficialDbLink url={item.official_url} />
              </div>
            )}
          </div>

          {/* 取引方法・サーバー */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded whitespace-nowrap ${buyRequest.trade_type === 'auction' ? 'text-[10px] bg-amber-900/40 border border-amber-600/40 text-amber-200' : 'text-xs bg-surface text-gray-300'}`}>
              {buyRequest.trade_type === 'auction' ? '🔨 オークション' : TRADE_TYPE_LABEL[buyRequest.trade_type]}
            </span>
            {buyRequest.servers.map((s) => (
              <span key={s.server} className={`text-xs px-2 py-0.5 rounded ${SERVER_COLORS[s.server]}`}>
                {s.server}
                {s.character?.character_name && (
                  <span className="ml-1 opacity-80">{s.character.character_name}</span>
                )}
              </span>
            ))}
          </div>

          {buyRequest.comment && (
            <p className="text-xs text-gray-400 line-clamp-1">{buyRequest.comment}</p>
          )}
        </div>

        {/* 右：買取希望価格・期限 */}
        <div className="text-right shrink-0 flex flex-col items-end justify-between">
          {buyRequest.trade_type === 'auction' ? (
            <div>
              <p className="text-[10px] text-amber-300/80 leading-none mb-0.5">現在価格</p>
              <p className="text-xl font-bold text-amber-300">{(buyRequest.current_price ?? buyRequest.price).toLocaleString()}</p>
              <p className="text-xs text-gray-400">{buyRequest.currency}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">入札 {buyRequest.bid_count ?? 0}件{buyRequest.buyout_price != null && ` ・即決 ${buyRequest.buyout_price.toLocaleString()}`}</p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] text-emerald-400/80 leading-none mb-0.5">買取希望</p>
              <p className="text-xl font-bold text-emerald-400">{buyRequest.price.toLocaleString()}</p>
              <p className="text-xs text-gray-400">{buyRequest.currency}</p>
            </div>
          )}
          <p className={`text-xs mt-2 whitespace-nowrap ${daysLeft <= 3 ? 'text-orange-400' : 'text-gray-500'}`}>
            {remainingLabel(buyRequest.expires_at, buyRequest.trade_type === 'auction')}
          </p>
        </div>
      </div>
    </Link>
  )
}
