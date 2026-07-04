import client from './client'

export interface PromoTweet {
  text: string
  // Xの重み付き文字数（全角2・半角1・URL23換算）と上限（280）
  length: number
  limit: number
}

export interface PromoTweetsResponse {
  mode: 'day' | 'range'
  // 単日モード: 集計の開始/終了（JSTの "YYYY-MM-DDTHH:mm"）と記録済みの前回ツイート時刻
  since: string | null
  until: string | null
  last_posted_at: string | null
  // 期間累計モード: 日付範囲（YYYY-MM-DD）
  from: string | null
  to: string | null
  trade_count: number
  listing_count: number
  buy_request_count: number
  // 【オークション現在価格】に載る進行中オークションの件数（出品＋買取）
  auction_count: number
  tweets: PromoTweet[]
}

// 単日（since〜現在）または期間累計（from〜to）のどちらかを指定する
// 単日で since 省略時はサーバ側の前回ツイート時刻（無ければ当日0:00）が使われる
export type PromoTweetsQuery = { since?: string } | { from: string; to: string }

export const promoTweetsApi = {
  // 管理: 宣伝ツイート文面を生成して取得
  list: (query: PromoTweetsQuery): Promise<{ data: PromoTweetsResponse }> => {
    const params = new URLSearchParams(query as Record<string, string>)
    return client.get<PromoTweetsResponse>(`/admin/promo-tweets?${params}`)
  },
  // 管理: 「Xでポスト」押下時に前回ツイート時刻を現在時刻で記録する
  markPosted: (): Promise<{ data: { last_posted_at: string } }> =>
    client.post<{ last_posted_at: string }>('/admin/promo-tweets/posted'),
}
