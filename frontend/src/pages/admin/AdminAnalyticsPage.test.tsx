import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AdminAnalyticsPage from './AdminAnalyticsPage'
import { adminAnalyticsApi } from '../../api/adminAnalytics'
import type { UsageResponse } from '../../api/adminAnalytics'

// design.md「10. 管理機能 > 利用状況解析」:
// 日別推移グラフ（6系列。登録=出品+買取、成立=出品成立+買取成立の合算を含む）は
// 既定で「登録」「成立」の2系列のみ表示し、チェックボックスで系列ごとに表示・非表示を
// 切り替えられ、「すべて」チェックで一括切替できる。

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
  totals: {
    listings: 11,
    buy_requests: 6,
    registrations: 17,
    listing_trades: 2,
    buy_request_trades: 1,
    trades: 3,
    trade_users: 6,
  },
  daily: [
    { date: '2026-08-05', listings: 1, buy_requests: 0, registrations: 1, listing_trades: 1, buy_request_trades: 0, trades: 1 },
    { date: '2026-08-06', listings: 2, buy_requests: 1, registrations: 3, listing_trades: 1, buy_request_trades: 1, trades: 2 },
  ],
})

const ALL_KEYS = ['registrations', 'listings', 'buy_requests', 'trades', 'listing_trades', 'buy_request_trades']
const DEFAULT_KEYS = ['registrations', 'trades']
const DETAIL_KEYS = ALL_KEYS.filter((k) => !DEFAULT_KEYS.includes(k))

describe('AdminAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUsage.mockResolvedValue({ data: makeUsage() })
  })

  it('初期表示は「登録」「成立」の2系列のみ表示し、サマリーカードを表示する', async () => {
    render(<AdminAnalyticsPage />)

    expect(await screen.findByTestId('line-chart')).toBeInTheDocument()
    for (const key of DEFAULT_KEYS) {
      expect(screen.getByTestId(`line-${key}`)).toBeInTheDocument()
    }
    for (const key of DETAIL_KEYS) {
      expect(screen.queryByTestId(`line-${key}`)).not.toBeInTheDocument()
    }
    // サマリーカードは全系列分（登録=17、成立=3）＋取引ユーザー
    expect(screen.getByText('17 件')).toBeInTheDocument()
    expect(screen.getByText('6 人')).toBeInTheDocument()
    expect(mockedUsage).toHaveBeenCalledWith(30)
  })

  it('チェックで系列を追加・削除できる', async () => {
    render(<AdminAnalyticsPage />)
    await screen.findByTestId('line-chart')

    // 既定OFFの「買取成立」をチェックすると表示される
    fireEvent.click(screen.getByLabelText('買取成立'))
    expect(screen.getByTestId('line-buy_request_trades')).toBeInTheDocument()

    // 既定ONの「登録」を外すと消える
    fireEvent.click(screen.getByLabelText('登録'))
    expect(screen.queryByTestId('line-registrations')).not.toBeInTheDocument()
    expect(screen.getByTestId('line-trades')).toBeInTheDocument()
  })

  it('「すべて」チェックで全系列を一括切替できる', async () => {
    render(<AdminAnalyticsPage />)
    await screen.findByTestId('line-chart')

    // 既定は部分チェックなので「すべて」は未チェック。押すと全系列が表示される
    expect(screen.getByLabelText('すべて')).not.toBeChecked()
    fireEvent.click(screen.getByLabelText('すべて'))
    for (const key of ALL_KEYS) {
      expect(screen.getByTestId(`line-${key}`)).toBeInTheDocument()
    }

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
})
