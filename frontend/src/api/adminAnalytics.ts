import client from './client'

export interface UsageDaily {
  // JST の日付（YYYY-MM-DD）
  date: string
  listings: number
  buy_requests: number
  // 登録の合計（listings + buy_requests）
  registrations: number
  // 出品由来の取引成立
  listing_trades: number
  // 買取由来の取引成立（trade_history.buy_request_id あり）
  buy_request_trades: number
  // 取引成立の合計（listing_trades + buy_request_trades）
  trades: number
}

export interface UsageResponse {
  days: number
  from: string
  to: string
  // 期間合計。listings/buy_requests は作成ベース、成立系は相場対象（is_valid=true）のみ。
  // trade_users は期間内の成立取引に売り手・買い手として関わったユニークユーザー数
  totals: {
    listings: number
    buy_requests: number
    registrations: number
    listing_trades: number
    buy_request_trades: number
    trades: number
    trade_users: number
  }
  // 期間内の全日（ゼロ埋め済み・昇順）
  daily: UsageDaily[]
}

export const adminAnalyticsApi = {
  // 管理: 利用状況の日次集計（出品数・買取数・取引成立数）を取得
  usage: (days: number): Promise<{ data: UsageResponse }> =>
    client.get<UsageResponse>(`/admin/analytics/usage?days=${days}`),
}
