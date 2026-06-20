import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ItemPriceAnalytics, PriceHistory, PriceOffer, PriceStats, TradeRecord } from '../types'
import { SERVER_COLORS, TRADE_TYPE_LABEL } from '../utils/constants'
import type { TradeType } from '../types'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts'

interface Props {
  analytics: ItemPriceAnalytics
  /** 指定するとアイテム名を X で検索するボタンを表示する */
  itemName?: string
}

function fmt(n: number) { return n.toLocaleString() }

function relativeDate(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return '今日'
  if (diff === 1) return '昨日'
  return `${diff}日前`
}

type View = 'overall' | 'sell' | 'buy'

const EMPTY_STATS: PriceStats = { min: 0, max: 0, avg: 0, median: 0, deal_count: 0, listing_count: 0 }

export default function PriceAnalytics({ analytics, itemName }: Props) {
  const [view, setView] = useState<View>('overall')

  const hasSell = !!analytics?.sell
  const hasBuy = !!analytics?.buy

  // 表示対象セクションのデータを view に応じて選択
  const section: {
    stats: PriceStats
    history: PriceHistory[]
    recent_deals: TradeRecord[]
    offers: PriceOffer[]
    offersLabel: string
    dealsLabel: string
    accent: string       // 価格テキストの色
    emptyOffers: string
  } = (() => {
    if (view === 'sell' && analytics.sell) {
      return {
        stats: analytics.sell.stats ?? EMPTY_STATS,
        history: analytics.sell.history ?? [],
        recent_deals: analytics.sell.recent_deals ?? [],
        offers: analytics.sell.recent_offers ?? [],
        offersLabel: '出品中の価格',
        dealsLabel: '売り取引の成立',
        accent: 'text-primary-500',
        emptyOffers: '現在の出品はありません',
      }
    }
    if (view === 'buy' && analytics.buy) {
      return {
        stats: analytics.buy.stats ?? EMPTY_STATS,
        history: analytics.buy.history ?? [],
        recent_deals: analytics.buy.recent_deals ?? [],
        offers: analytics.buy.recent_offers ?? [],
        offersLabel: '買取募集中の価格',
        dealsLabel: '買い取引の成立',
        accent: 'text-emerald-400',
        emptyOffers: '現在の買取募集はありません',
      }
    }
    return {
      stats: analytics?.stats ?? EMPTY_STATS,
      history: analytics?.history ?? [],
      recent_deals: analytics?.recent_deals ?? [],
      offers: analytics?.recent_listings ?? [],
      offersLabel: '出品中の価格',
      dealsLabel: '過去の取引成立',
      accent: 'text-primary-500',
      emptyOffers: '現在の出品はありません',
    }
  })()

  const { stats, history, recent_deals, offers } = section
  const hasData = stats.deal_count > 0

  // 募集価格一覧の各行から個別の詳細ページへ飛ばす導線。買い相場タブは買取詳細、それ以外は出品詳細へ。
  // id を持たない古いレスポンスではリンクを出さない。
  const offerDetailBase = view === 'buy' ? '/buy-requests' : '/listings'
  const offerDetailLabel = view === 'buy' ? '買取を見る' : '出品を見る'

  const tabs: { key: View; label: string }[] = [
    { key: 'overall', label: '総合' },
    ...(hasSell ? [{ key: 'sell' as View, label: '売り相場' }] : []),
    ...(hasBuy ? [{ key: 'buy' as View, label: '買い相場' }] : []),
  ]

  return (
    <div className="space-y-5">
      {/* 売り相場 / 買い相場 切替 ＋ アイテム名を X で検索するボタン（同じ行に並べる） */}
      {(tabs.length > 1 || itemName) && (
        <div>
          <div className="flex items-center gap-3">
            {tabs.length > 1 && (
              <div className="inline-flex rounded-lg border border-surface-border bg-surface p-0.5">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setView(t.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      view === t.key ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {/* アイテム名を X（旧Twitter）で検索（新規ウィンドウ）。常に行の右端に配置 */}
            {itemName && (
              <a
                href={`https://x.com/search?q=${encodeURIComponent(itemName)}&src=typed_query`}
                target="_blank"
                rel="noopener noreferrer"
                title="アイテム名を X で検索"
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-surface-border bg-surface text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Xで検索
              </a>
            )}
          </div>
          {tabs.length > 1 && (
            <p className="text-xs text-gray-500 mt-1.5">
              {view === 'sell'
                ? '出品（売りたい）由来の成立価格・出品中の価格です。'
                : view === 'buy'
                ? '買取（買いたい）由来の成立価格・買取募集中の価格です。'
                : '出品・買取・他サイト相場をまとめた相場です。'}
            </p>
          )}
        </div>
      )}

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
            {section.dealsLabel} ({recent_deals.length}件)
          </h3>
          {recent_deals.length === 0 ? (
            <p className="text-sm text-gray-500">取引成立の記録がありません</p>
          ) : (
            <div className="space-y-1.5">
              {recent_deals.map((d) => (
                <div key={`${d.source ?? 'trade'}-${d.id}`} className="flex items-center gap-3 bg-surface rounded px-3 py-2 text-sm">
                  <span className={`font-bold w-28 shrink-0 ${section.accent}`}>
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

        {/* 現在の募集価格一覧 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {section.offersLabel} ({offers.length}件)
          </h3>
          {offers.length === 0 ? (
            <p className="text-sm text-gray-500">{section.emptyOffers}</p>
          ) : (
            <div className="space-y-1.5">
              {offers.map((l, i) => (
                <div key={l.id ?? i} className="flex items-center gap-3 bg-surface rounded px-3 py-2 text-sm">
                  <span className={`font-bold w-28 shrink-0 ${view === 'buy' ? 'text-emerald-400' : 'text-white'}`}>
                    {fmt(l.price)} {l.currency}
                  </span>
                  <span className="text-xs bg-surface-card border border-surface-border text-gray-300 px-2 py-0.5 rounded shrink-0">
                    {TRADE_TYPE_LABEL[l.trade_type as TradeType] ?? l.trade_type}
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">{relativeDate(l.listed_at)}</span>
                  {/* 各行からその出品／買取の詳細ページへリンク（id が無い古いレスポンスでは非表示） */}
                  {l.id != null && (
                    <Link
                      to={`${offerDetailBase}/${l.id}`}
                      className="text-xs whitespace-nowrap text-primary-400 hover:text-primary-300 transition-colors shrink-0"
                    >
                      {offerDetailLabel} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
