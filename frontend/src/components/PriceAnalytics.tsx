import type { ItemPriceAnalytics } from '../types'
import { SERVER_COLORS, TRADE_TYPE_LABEL } from '../utils/constants'
import type { TradeType } from '../types'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts'

interface Props {
  analytics: ItemPriceAnalytics
}

function fmt(n: number) { return n.toLocaleString() }

function relativeDate(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return '今日'
  if (diff === 1) return '昨日'
  return `${diff}日前`
}

export default function PriceAnalytics({ analytics }: Props) {
  // バックエンドのレスポンス欠落に備えて安全なデフォルトを与える
  const stats = analytics?.stats ?? {
    min: 0, max: 0, avg: 0, median: 0, deal_count: 0, listing_count: 0,
  }
  const history = analytics?.history ?? []
  const recent_deals = analytics?.recent_deals ?? []
  const recent_listings = analytics?.recent_listings ?? []
  const hasData = stats.deal_count > 0

  return (
    <div className="space-y-5">
      {/* 統計サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: '最安値',       value: hasData ? `${fmt(stats.min)} AC` : '—' },
          { label: '最高値',       value: hasData ? `${fmt(stats.max)} AC` : '—' },
          { label: '平均価格',     value: hasData ? `${fmt(stats.avg)} AC` : '—' },
          { label: '中央値',       value: hasData ? `${fmt(stats.median)} AC` : '—' },
          { label: '取引成立件数', value: `${stats.deal_count} 件` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface rounded-lg px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-base font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* 相場変動グラフ */}
      {history.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">相場変動</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#353858" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                width={52}
                allowDecimals={false}
                tickFormatter={(v) => (v >= 10000 ? `${+(v / 10000).toFixed(1)}万` : fmt(v))}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#242740', border: '1px solid #353858', borderRadius: '6px' }}
                labelStyle={{ color: '#d1d5db', marginBottom: 4 }}
                formatter={(v: number) => `${fmt(v)} AC`}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Line type="monotone" dataKey="min"    stroke="#60a5fa" dot={false} name="最安値" strokeWidth={1.5} />
              <Line type="monotone" dataKey="avg"    stroke="#4f6ef7" dot={false} name="平均"   strokeWidth={2} />
              <Line type="monotone" dataKey="median" stroke="#a78bfa" dot={false} name="中央値" strokeWidth={1.5} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="max"    stroke="#818cf8" dot={false} name="最高値" strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-gray-500">相場データがまだありません</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 過去の取引成立 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            過去の取引成立 ({recent_deals.length}件)
          </h3>
          {recent_deals.length === 0 ? (
            <p className="text-sm text-gray-500">取引成立の記録がありません</p>
          ) : (
            <div className="space-y-1.5">
              {recent_deals.map((d) => (
                <div key={`${d.source ?? 'trade'}-${d.id}`} className="flex items-center gap-3 bg-surface rounded px-3 py-2 text-sm">
                  <span className="font-bold text-primary-500 w-28 shrink-0">
                    {fmt(d.price)} {d.currency}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SERVER_COLORS[d.server]}`}>
                    {d.server}
                  </span>
                  {d.source === 'manual' && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-sky-900/30 border border-sky-700/40 text-sky-300"
                      title="他サイトで取引された相場情報（手動登録）"
                    >
                      他サイト
                    </span>
                  )}
                  {d.is_valid === false && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-yellow-900/30 border border-yellow-700/40 text-yellow-300"
                      title="同一IPでの取引のため統計・グラフには含まれません"
                    >
                      相場対象外
                    </span>
                  )}
                  <span className="text-xs text-gray-500 ml-auto">{relativeDate(d.traded_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 現在の出品価格一覧 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            出品中の価格 ({recent_listings.length}件)
          </h3>
          {recent_listings.length === 0 ? (
            <p className="text-sm text-gray-500">現在の出品はありません</p>
          ) : (
            <div className="space-y-1.5">
              {recent_listings.map((l, i) => (
                <div key={i} className="flex items-center gap-3 bg-surface rounded px-3 py-2 text-sm">
                  <span className="font-bold text-white w-28 shrink-0">
                    {fmt(l.price)} {l.currency}
                  </span>
                  <span className="text-xs bg-surface-card border border-surface-border text-gray-300 px-2 py-0.5 rounded shrink-0">
                    {TRADE_TYPE_LABEL[l.trade_type as TradeType] ?? l.trade_type}
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">{relativeDate(l.listed_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
