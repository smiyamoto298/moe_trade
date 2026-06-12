import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PriceAnalytics from './PriceAnalytics'
import type { ItemPriceAnalytics, PriceMarketSection, TradeRecord } from '../types'

// design.md「価格データ解析」:
// - 取引履歴が無いアイテムでも 0 埋めの統計で画面が落ちない
// - 同一IP取引は「相場対象外」、他サイト相場は「他サイト」バッジで区別
// - 買取由来は「買い相場」、出品由来は「売り相場」としてタブで分割表示

const emptyStats = { min: 0, max: 0, avg: 0, median: 0, deal_count: 0, listing_count: 0 }

const base = (over: Partial<ItemPriceAnalytics> = {}): ItemPriceAnalytics => ({
  item_id: 1,
  stats: emptyStats,
  history: [],
  recent_deals: [],
  recent_listings: [],
  ...over,
})

const deal = (over: Partial<TradeRecord> = {}): TradeRecord => ({
  id: 1,
  price: 50000,
  currency: 'AC',
  server: 'Emerald',
  traded_at: new Date().toISOString(),
  ...over,
})

describe('PriceAnalytics', () => {
  it('取引履歴が無い場合は統計を「—」で表示し、相場データなしの案内を出す', () => {
    render(<PriceAnalytics analytics={base()} />)
    // 最安値・最高値・平均・中央値の4枠が「—」
    expect(screen.getAllByText('—')).toHaveLength(4)
    expect(screen.getByText('0 件')).toBeInTheDocument()
    expect(screen.getByText('相場データがまだありません')).toBeInTheDocument()
    expect(screen.getByText('現在の出品はありません')).toBeInTheDocument()
  })

  it('統計サマリーに価格を桁区切りで表示する', () => {
    render(
      <PriceAnalytics
        analytics={base({
          stats: { min: 10000, max: 120000, avg: 50000, median: 45000, deal_count: 7, listing_count: 2 },
          recent_deals: [deal()],
        })}
      />
    )
    expect(screen.getByText('10,000 AC')).toBeInTheDocument()
    expect(screen.getByText('120,000 AC')).toBeInTheDocument()
    expect(screen.getByText('7 件')).toBeInTheDocument()
  })

  it('同一IP取引には「相場対象外」、他サイト相場には「他サイト」バッジを表示する', () => {
    render(
      <PriceAnalytics
        analytics={base({
          recent_deals: [
            deal({ id: 1, is_valid: false }),
            deal({ id: 2, source: 'manual', is_valid: true }),
            deal({ id: 3, is_valid: true }),
          ],
        })}
      />
    )
    expect(screen.getByText('相場対象外')).toBeInTheDocument()
    expect(screen.getByText('他サイト')).toBeInTheDocument()
  })

  it('sell / buy が無い場合は相場タブを表示しない', () => {
    render(<PriceAnalytics analytics={base()} />)
    expect(screen.queryByRole('button', { name: '売り相場' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '買い相場' })).not.toBeInTheDocument()
  })

  it('売り相場・買い相場タブを切り替えられる', async () => {
    const section = (deals: TradeRecord[]): PriceMarketSection => ({
      stats: { ...emptyStats, deal_count: deals.length },
      history: [],
      recent_deals: deals,
      recent_offers: [],
    })
    render(
      <PriceAnalytics
        analytics={base({
          sell: section([deal({ id: 1 })]),
          buy: section([deal({ id: 2, price: 30000 })]),
        })}
      />
    )
    // 総合・売り相場・買い相場の3タブ
    expect(screen.getByRole('button', { name: '総合' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '買い相場' }))
    expect(screen.getByText(/買い取引の成立/)).toBeInTheDocument()
    expect(screen.getByText('買取募集中の価格 (0件)')).toBeInTheDocument()
    expect(screen.getByText('現在の買取募集はありません')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '売り相場' }))
    expect(screen.getByText(/売り取引の成立/)).toBeInTheDocument()
    expect(screen.getByText('現在の出品はありません')).toBeInTheDocument()
  })
})
