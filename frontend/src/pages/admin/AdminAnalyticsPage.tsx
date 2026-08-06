import { useEffect, useState } from 'react'
import { adminAnalyticsApi } from '../../api/adminAnalytics'
import type { UsageResponse } from '../../api/adminAnalytics'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts'

// 期間の選択肢（日数）
const PERIODS = [
  { days: 7, label: '7日' },
  { days: 30, label: '30日' },
  { days: 90, label: '90日' },
  { days: 365, label: '1年' },
] as const

// 系列の定義。色は暗色サーフェス上でのコントラスト・色覚多様性を検証済みのパレット。
// 緑と橙は色だけでは区別しづらい組み合わせのため、破線・点線でも区別できるようにする。
const SERIES = [
  { key: 'listings', label: '出品', color: '#3b82f6', dash: undefined },
  { key: 'buy_requests', label: '買取', color: '#059669', dash: '5 3' },
  { key: 'listing_trades', label: '出品成立', color: '#d97706', dash: '2 2' },
  { key: 'buy_request_trades', label: '買取成立', color: '#db2777', dash: '8 3 2 3' },
] as const

type SeriesKey = (typeof SERIES)[number]['key']

const ALL_VISIBLE: Record<SeriesKey, boolean> = {
  listings: true,
  buy_requests: true,
  listing_trades: true,
  buy_request_trades: true,
}

// 「YYYY-MM-DD」を「M/D」に短縮（X軸ラベル用）
const fmtDate = (iso: string): string => {
  const [, m, d] = iso.split('-')
  return `${+m}/${+d}`
}

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState<number>(30)
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // グラフに表示する系列（チェックボックスで切替）
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>(ALL_VISIBLE)

  const allVisible = SERIES.every(({ key }) => visible[key])
  const shownSeries = SERIES.filter(({ key }) => visible[key])

  useEffect(() => {
    setLoading(true)
    setError(false)
    adminAnalyticsApi
      .usage(days)
      .then((r) => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [days])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h1 className="text-xl font-bold text-white">利用状況解析</h1>
        <div className="inline-flex rounded-lg border border-surface-border bg-surface p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                days === p.days ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-5">
        出品・買取の登録件数（取り下げ・期限切れ分も含む）と取引成立件数（出品由来・買取由来別、相場対象のみ）を日別に集計します。日付は日本時間です。
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : error || !data ? (
        <p className="text-sm text-red-400">利用状況の取得に失敗しました。時間をおいて再度お試しください。</p>
      ) : (
        <>
          {/* 期間合計 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {SERIES.map(({ key, label, color }) => (
              <div key={key} className="bg-surface rounded-lg px-4 py-3 text-center">
                <p className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                  {label}
                </p>
                <p className="text-lg font-bold text-white">{data.totals[key].toLocaleString()} 件</p>
              </div>
            ))}
            <div
              className="bg-surface rounded-lg px-4 py-3 text-center"
              title="期間内の取引成立に売り手・買い手として関わったユーザーの数（重複なし）"
            >
              <p className="text-xs text-gray-400 mb-1">取引ユーザー</p>
              <p className="text-lg font-bold text-white">{data.totals.trade_users.toLocaleString()} 人</p>
            </div>
          </div>

          {/* 日別推移（チェックボックスで表示する系列を切替） */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              日別推移（{fmtDate(data.from)}〜{fmtDate(data.to)}）
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 ml-auto">
              <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allVisible}
                  onChange={() =>
                    setVisible(
                      allVisible
                        ? { listings: false, buy_requests: false, listing_trades: false, buy_request_trades: false }
                        : ALL_VISIBLE
                    )
                  }
                  className="accent-gray-400"
                />
                すべて
              </label>
              {SERIES.map(({ key, label, color }) => (
                <label key={key} className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={visible[key]}
                    onChange={() => setVisible((v) => ({ ...v, [key]: !v[key] }))}
                    style={{ accentColor: color }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          {shownSeries.length === 0 ? (
            <p className="text-sm text-gray-500 py-10 text-center">表示する系列が選択されていません。</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#353858" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} width={40} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#242740', border: '1px solid #353858', borderRadius: '6px' }}
                  labelStyle={{ color: '#d1d5db', marginBottom: 4 }}
                  labelFormatter={(v: string) => v}
                  formatter={(v: number) => `${v} 件`}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                {shownSeries.map(({ key, label, color, dash }) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={color}
                    dot={false}
                    name={label}
                    strokeWidth={2}
                    strokeDasharray={dash}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  )
}
