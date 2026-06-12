import client from './client'

export interface PromoTweet {
  text: string
  // Xの重み付き文字数（全角2・半角1・URL23換算）と上限（280）
  length: number
  limit: number
}

export interface PromoTweetsResponse {
  mode: 'day' | 'range'
  date: string | null
  from: string
  to: string
  trade_count: number
  listing_count: number
  buy_request_count: number
  tweets: PromoTweet[]
}

// 単日（date）または期間累計（from〜to）のどちらかを指定する
export type PromoTweetsQuery = { date: string } | { from: string; to: string }

export const promoTweetsApi = {
  // 管理: 宣伝ツイート文面を生成して取得
  list: (query: PromoTweetsQuery): Promise<{ data: PromoTweetsResponse }> => {
    const params = new URLSearchParams(query)
    return client.get<PromoTweetsResponse>(`/admin/promo-tweets?${params}`)
  },
}
