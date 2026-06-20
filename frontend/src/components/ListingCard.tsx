import { Link } from 'react-router-dom'
import type { Listing } from '../types'
import { TRADE_TYPE_LABEL, SERVER_COLORS, BASE_STAT_LABELS, SPECIAL_CONDITIONS, formatSignedValue, formatBonusValueDisplay } from '../utils/constants'
import UnverifiedBadge from './UnverifiedBadge'

interface Props {
  listing: Listing
}

export default function ListingCard({ listing }: Props) {
  const daysLeft = Math.ceil(
    (new Date(listing.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const { item } = listing

  return (
    <Link
      to={`/listings/${listing.id}`}
      className="block bg-surface-card border border-surface-border rounded-lg hover:border-primary-500/60 transition-colors"
    >
      {item.verified_status === 'unverified' && (
        <div className="px-4 pt-3">
          <UnverifiedBadge />
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-3">
        {/* 左：アイテム情報 */}
        <div className="min-w-0 space-y-2">
          {/* 種別・名前 */}
          <div>
            <p className="text-xs text-gray-400">{item.category.name}</p>
            <h3 className="font-medium text-white">{item.name}</h3>
          </div>

          {/* 追加効果 */}
          {(Object.keys(item.base_stats).length > 0 || item.mithril) && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(item.base_stats).map(([key, val]) => (
                <span key={key} className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
                  {BASE_STAT_LABELS[key] ?? key}: <span className="text-white font-medium">{formatSignedValue(val)}</span>
                </span>
              ))}
              {item.mithril && (
                <span className="text-xs bg-slate-700/40 border border-slate-400/40 rounded px-1.5 py-0.5 text-slate-200">
                  ミスリル
                </span>
              )}
            </div>
          )}

          {/* 付加効果（専用技は付加効果ごとに表示） */}
          {item.bonus_effects.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.bonus_effects.map((e) => (
                <span key={e.id} className="text-xs bg-surface border border-primary-500/20 rounded px-1.5 py-0.5 text-primary-500">
                  {e.effect_name}
                  {e.is_exclusive && (
                    <span className="ml-1 text-[10px] bg-amber-900/40 border border-amber-600/40 rounded px-1 py-px text-amber-200">専用技</span>
                  )}
                  {e.values?.length > 0 && (
                    <span className="text-gray-400 ml-1">
                      {e.values.map((v, i) => (
                        <span key={i}>{i > 0 && '/'}{v.value_unit === 'none' ? v.label : formatBonusValueDisplay(v.value, v.value_unit)}</span>
                      ))}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* 染色 */}
          {item.dyeable !== null && item.dyeable !== undefined && (
            <span className={`text-xs rounded px-1.5 py-0.5 ${item.dyeable ? 'bg-blue-900/30 border border-blue-700/30 text-blue-300' : 'bg-gray-800 border border-gray-700 text-gray-400'}`}>
              {item.dyeable ? '染色可' : '染色不可'}
            </span>
          )}

          {/* 特殊条件 */}
          {item.special_conditions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.special_conditions.map((c) => (
                <span key={c} title={SPECIAL_CONDITIONS[c]}
                  className="text-xs bg-red-900/30 border border-red-700/30 text-red-300 rounded px-1.5 py-0.5">
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* サーバー・取引方法 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs bg-surface text-gray-300 px-2 py-0.5 rounded">
              {TRADE_TYPE_LABEL[listing.trade_type]}
            </span>
            {listing.servers.map((s) => (
              <span key={s.server} className={`text-xs px-2 py-0.5 rounded ${SERVER_COLORS[s.server]}`}>
                {s.server}
              </span>
            ))}
          </div>

          {listing.comment && (
            <p className="text-xs text-gray-400 line-clamp-1">{listing.comment}</p>
          )}
        </div>

        {/* 右：価格・期限 */}
        <div className="text-right shrink-0 flex flex-col items-end justify-between">
          <div>
            <p className="text-xl font-bold text-primary-500">{listing.price.toLocaleString()}</p>
            <p className="text-xs text-gray-400">{listing.currency}</p>
          </div>
          <p className={`text-xs mt-2 ${daysLeft <= 3 ? 'text-orange-400' : 'text-gray-500'}`}>
            残り{daysLeft}日
          </p>
        </div>
      </div>
    </Link>
  )
}
