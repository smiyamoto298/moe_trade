import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AdminAnalyticsPage from './AdminAnalyticsPage'
import { adminAnalyticsApi } from '../../api/adminAnalytics'
import type { UsageResponse } from '../../api/adminAnalytics'

// design.md「10. 管理機能 > 利用状況解析」:
// 日別推移グラフ（4系列）はチェックボックスで系列ごとに表示・非表示を切り替えられ、
// 「すべて」チェックで一括切替できる。

vi.mock('../../api/adminAnalytics', () => ({ adminAnalyticsApi: { usage: vi.fn() } }))
// recharts はスタブ化し、Line の dataKey だけ検証できるようにする
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
}))

const mockedUsage = vi.mocked(adminAnalyticsApi.usage)

const makeUsage = (): UsageResponse => ({
  days: 30,
  from: '2026-07-08',
  to: '2026-08-06',
  totals: { listings: 11, buy_requests: 6, listing_trades: 2, buy_request_trades: 1, trades: 3, trade_users: 6 },
  daily: [
    { date: '2026-08-05', listings: 1, buy_requests: 0, listing_trades: 1, buy_request_trades: 0, trades: 1 },
    { date: '2026-08-06', listings: 2, buy_requests: 1, listing_trades: 1, buy_request_trades: 1, trades: 2 },
  ],
})

const ALL_KEYS = ['listings', 'buy_requests', 'listing_trades', 'buy_request_trades']

describe('AdminAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUsage.mockResolvedValue({ data: makeUsage() })
  })

  it('初期表示は全系列のグラフとサマリーカードを表示する', async () => {
    render(<AdminAnalyticsPage />)

    expect(await screen.findByTestId('line-chart')).toBeInTheDocument()
    for (const key of ALL_KEYS) {
      expect(screen.getByTestId(`line-${key}`)).toBeInTheDocument()
    }
    expect(screen.getByText('6 人')).toBeInTheDocument()
    expect(mockedUsage).toHaveBeenCalledWith(30)
  })

  it('チェックを外した系列はグラフから消える', async () => {
    render(<AdminAnalyticsPage />)
    await screen.findByTestId('line-chart')

    fireEvent.click(screen.getByLabelText('買取成立'))

    expect(screen.queryByTestId('line-buy_request_trades')).not.toBeInTheDocument()
    expect(screen.getByTestId('line-listings')).toBeInTheDocument()

    // 再チェックで復帰する
    fireEvent.click(screen.getByLabelText('買取成立'))
    expect(screen.getByTestId('line-buy_request_trades')).toBeInTheDocument()
  })

  it('「すべて」チェックで全系列を一括切替できる', async () => {
    render(<AdminAnalyticsPage />)
    await screen.findByTestId('line-chart')

    // 全チェック状態から一括OFF → グラフの代わりに案内文を表示
    fireEvent.click(screen.getByLabelText('すべて'))
    for (const key of ALL_KEYS) {
      expect(screen.queryByTestId(`line-${key}`)).not.toBeInTheDocument()
    }
    expect(screen.getByText('表示する系列が選択されていません。')).toBeInTheDocument()

    // 一括ON で全系列が復帰する
    fireEvent.click(screen.getByLabelText('すべて'))
    for (const key of ALL_KEYS) {
      expect(screen.getByTestId(`line-${key}`)).toBeInTheDocument()
    }
  })

  it('一部だけチェックを外すと「すべて」は未チェックになり、押すと全チェックに戻る', async () => {
    render(<AdminAnalyticsPage />)
    await screen.findByTestId('line-chart')

    fireEvent.click(screen.getByLabelText('出品'))
    expect(screen.getByLabelText('すべて')).not.toBeChecked()

    // 部分チェック状態で「すべて」を押すと全チェックへ
    fireEvent.click(screen.getByLabelText('すべて'))
    expect(screen.getByLabelText('すべて')).toBeChecked()
    for (const key of ALL_KEYS) {
      expect(screen.getByTestId(`line-${key}`)).toBeInTheDocument()
    }
  })
})
