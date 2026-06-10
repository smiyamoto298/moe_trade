import client from './client'
import type { BuyRequest, BuyRequestSearchParams, Paginated, TradeChat } from '../types'

export interface BuyRequestCreatePayload {
  item_id: number
  price: number
  currency: string
  quantity: number
  trade_type: string
  comment: string
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

  create: (data: BuyRequestCreatePayload) => client.post<BuyRequest>('/buy-requests', data),

  update: (id: number, data: Partial<BuyRequestCreatePayload>) =>
    client.put<BuyRequest>(`/buy-requests/${id}`, data),

  cancel: (id: number) => client.delete(`/buy-requests/${id}`),

  renew: (id: number) => client.post(`/buy-requests/${id}/renew`),

  // 売り手（相手側）が買取登録者へ取引希望を送る（なければ作成）
  createChat: (buyRequestId: number, server: string): Promise<{ data: TradeChat }> =>
    client.post<TradeChat>(`/buy-requests/${buyRequestId}/chats`, { server }),
}
