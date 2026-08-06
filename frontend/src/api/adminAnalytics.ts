import client from './client'

export interface UsageDaily {
  // JST の日付（YYYY-MM-DD）
  date: string
  listings: number
  buy_requests: number
  trades: number
}

export interface UsageResponse {
  days: number
  from: string
  to: string
  // 期間合計。listings/buy_requests は作成ベース、trades は相場対象（is_valid=true）のみ
  totals: { listings: number; buy_requests: number; trades: number }
  // 期間内の全日（ゼロ埋め済み・昇順）
  daily: UsageDaily[]
}

export const adminAnalyticsApi = {
  // 管理: 利用状況の日次集計（出品数・買取数・取引成立数）を取得
  usage: (days: number): Promise<{ data: UsageResponse }> =>
    client.get<UsageResponse>(`/admin/analytics/usage?days=${days}`),
}
