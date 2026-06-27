import client from './client'
import type { BuyRequest, BuyRequestSearchParams, BuyPriceInfo, Paginated, TradeChat } from '../types'

export interface BuyRequestCreatePayload {
  item_id: number
  price: number
  currency: string
  quantity: number
  trade_type: string
  comment: string
  /** 即決価格（オークションのみ・任意） */
  buyout_price?: number | null
  /** 期限日（オークションのみ・ISO8601） */
  expires_at?: string
  servers: { server: string; character_id: number | null }[]
}

export const buyRequestsApi = {
  list: (params: BuyRequestSearchParams): Promise<{ data: Paginated<BuyRequest> }> =>
    client.get<Paginated<BuyRequest>>('/buy-requests', {
      params,
      // item_names[] を配列としてシリアライズ（axios デフォルトは item_names[]=a&item_names[]=b）
      paramsSerializer: { indexes: true },
    }),

  get: (id: number): Promise<{ data: BuyRequest }> =>
    client.get<BuyRequest>(`/buy-requests/${id}`),

  // 指定アイテム群の「他ユーザーが買取中の最高額」を item_id ごとに取得する。
  prices: (itemIds: number[]): Promise<{ data: Record<string, BuyPriceInfo> }> =>
    client.post<Record<string, BuyPriceInfo>>('/buy-requests/prices', { item_ids: itemIds }),

  create: (data: BuyRequestCreatePayload) => client.post<BuyRequest>('/buy-requests', data),

  update: (id: number, data: Partial<BuyRequestCreatePayload>) =>
    client.put<BuyRequest>(`/buy-requests/${id}`, data),

  cancel: (id: number) => client.delete(`/buy-requests/${id}`),

  // payload を渡すと再登録時に価格・取引方法を変更できる（省略時は現状維持で期限延長のみ）。
  // オークションの再登録では price（上げる）・buyout_price・expires_at を渡す。
  renew: (id: number, payload?: { price?: number; trade_type?: string; buyout_price?: number | null; expires_at?: string }) =>
    client.post(`/buy-requests/${id}/renew`, payload),

  // 売り手（相手側）が買取登録者へ取引希望を送る（なければ作成）
  // オークションでは bidPrice を渡して入札する。
  createChat: (buyRequestId: number, server: string, bidPrice?: number): Promise<{ data: TradeChat }> =>
    client.post<TradeChat>(`/buy-requests/${buyRequestId}/chats`, bidPrice != null ? { server, bid_price: bidPrice } : { server }),
}
