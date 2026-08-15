import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AdminAnalyticsPage from './AdminAnalyticsPage'
import { adminAnalyticsApi } from '../../api/adminAnalytics'
import type { UsageResponse } from '../../api/adminAnalytics'

// design.md「10. 管理機能 > 利用状況解析」:
// 日別推移グラフ（7系列。登録=出品+買取、成立=出品成立+買取成立の合算と、
// 日ごとのユニークアクセスユーザー数「アクセス」を含む）は
// 既定で「登録」「成立」「アクセス」の3系列のみ表示し、チェックボックスで系列ごとに
// 表示・非表示を切り替えられ、「すべて」チェックで一括切替できる。
// 時間帯分布の棒グラフは同じチェックボックスに追従するが、時刻を持たない「アクセス」は含まない。

vi.mock('../../api/adminAnalytics', () => ({ adminAnalyticsApi: { usage: vi.fn() } }))
// recharts はスタブ化し、Line / Bar の dataKey だけ検証できるようにする
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
  BarChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />,
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
    active_users: 9,
  },
  daily: [
    { date: '2026-08-05', listings: 1, buy_requests: 0, registrations: 1, listing_trades: 1, buy_request_trades: 0, trades: 1, active_users: 4 },
    { date: '2026-08-06', listings: 2, buy_requests: 1, registrations: 3, listing_trades: 1, buy_request_trades: 1, trades: 2, active_users: 7 },
  ],
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    listings: hour === 10 ? 3 : 0,
    buy_requests: hour === 10 ? 1 : 0,
    registrations: hour === 10 ? 4 : 0,
    listing_trades: hour === 10 ? 2 : 0,
    buy_request_trades: hour === 10 ? 1 : 0,
    trades: hour === 10 ? 3 : 0,
  })),
})

const ALL_KEYS = ['registrations', 'listings', 'buy_requests', 'trades', 'listing_trades', 'buy_request_trades', 'active_users']
const DEFAULT_KEYS = ['registrations', 'trades', 'active_users']
const DETAIL_KEYS = ALL_KEYS.filter((k) => !DEFAULT_KEYS.includes(k))
// 時間帯分布に出せる系列（アクセスは日単位の記録のため時刻を持たない）
const HOURLY_KEYS = ALL_KEYS.filter((k) => k !== 'active_users')

describe('AdminAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUsage.mockResolvedValue({ data: makeUsage() })
  })

  it('初期表示は「登録」「成立」「アクセス」の3系列のみ表示し、サマリーカードを表示する', async () => {
    render(<AdminAnalyticsPage />)

    expect(await screen.findByTestId('line-chart')).toBeInTheDocument()
    for (const key of DEFAULT_KEYS) {
      expect(screen.getByTestId(`line-${key}`)).toBeInTheDocument()
    }
    for (const key of DETAIL_KEYS) {
      expect(screen.queryByTestId(`line-${key}`)).not.toBeInTheDocument()
    }
    // サマリーカードは全系列分（登録=17、成立=3）＋アクセス（人表記）＋取引ユーザー
    expect(screen.getByText('17 件')).toBeInTheDocument()
    expect(screen.getByText('6 人')).toBeInTheDocument()
    expect(screen.getByText('9 人')).toBeInTheDocument()
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

    // 全チェック状態から一括OFF → グラフの代わりに案内文を表示（日別推移・時間帯分布の両方）
    fireEvent.click(screen.getByLabelText('すべて'))
    for (const key of ALL_KEYS) {
      expect(screen.queryByTestId(`line-${key}`)).not.toBeInTheDocument()
    }
    expect(screen.getAllByText('表示する系列が選択されていません。')).toHaveLength(2)

    // 一括ON で全系列が復帰する
    fireEvent.click(screen.getByLabelText('すべて'))
    for (const key of ALL_KEYS) {
      expect(screen.getByTestId(`line-${key}`)).toBeInTheDocument()
    }
  })

  it('時間帯分布の棒グラフを表示し、時刻を持たない「アクセス」は含めない', async () => {
    render(<AdminAnalyticsPage />)
    await screen.findByTestId('bar-chart')

    // 既定表示のうち、時刻を持つ「登録」「成立」だけが棒グラフに出る
    expect(screen.getByTestId('bar-registrations')).toBeInTheDocument()
    expect(screen.getByTestId('bar-trades')).toBeInTheDocument()
    expect(screen.queryByTestId('bar-active_users')).not.toBeInTheDocument()
    expect(screen.getByText(/日付が違っても同じ時刻は同一時間として集計します/)).toBeInTheDocument()

    // 「すべて」チェックでもアクセス以外の6系列のみが棒グラフに追加される
    fireEvent.click(screen.getByLabelText('すべて'))
    for (const key of HOURLY_KEYS) {
      expect(screen.getByTestId(`bar-${key}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('bar-active_users')).not.toBeInTheDocument()
  })

  it('「アクセス」だけを選ぶと時間帯分布は案内文になる', async () => {
    render(<AdminAnalyticsPage />)
    await screen.findByTestId('bar-chart')

    fireEvent.click(screen.getByLabelText('登録'))
    fireEvent.click(screen.getByLabelText('成立'))

    // 日別推移にはアクセスが残るが、時間帯分布は表示できる系列が無くなる
    expect(screen.getByTestId('line-active_users')).toBeInTheDocument()
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
    expect(screen.getByText('表示する系列が選択されていません。')).toBeInTheDocument()
  })
})
