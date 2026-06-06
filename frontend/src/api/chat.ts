import client from './client'
import { USE_MOCK, mockChats } from './mock'
import type { TradeChat } from '../types'

export const chatApi = {
  // 出品に対する自分のチャットを取得（なければ作成）
  getOrCreate: (listingId: number, server: string): Promise<{ data: TradeChat }> => {
    if (USE_MOCK) {
      const found = mockChats.find((c) => c.listing_id === listingId && c.buyer_id === 99 && c.server === server)
      if (found) return Promise.resolve({ data: { ...found } })
      const newChat: TradeChat = {
        id: Date.now(), listing_id: listingId, buyer_id: 99,
        buyer_character_name: 'MockUser', server: server as TradeChat['server'],
        status: 'open', seller_completed: false, buyer_completed: false, messages: [],
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      mockChats.push(newChat)
      return Promise.resolve({ data: newChat })
    }
    return client.post<TradeChat>(`/listings/${listingId}/chats`, { server })
  },

  // 出品者向け：出品に対する全チャット一覧
  listByListing: (listingId: number): Promise<{ data: TradeChat[] }> => {
    if (USE_MOCK) return Promise.resolve({ data: mockChats.filter((c) => c.listing_id === listingId) })
    return client.get<TradeChat[]>(`/listings/${listingId}/chats`)
  },

  get: (chatId: number): Promise<{ data: TradeChat }> => {
    if (USE_MOCK) {
      const chat = mockChats.find((c) => c.id === chatId)!
      return Promise.resolve({ data: { ...chat } })
    }
    return client.get<TradeChat>(`/chats/${chatId}`)
  },

  sendMessage: (chatId: number, message: string): Promise<{ data: any }> => {
    if (USE_MOCK) {
      const chat = mockChats.find((c) => c.id === chatId)!
      chat.messages.push({ id: Date.now(), chat_id: chatId, user_id: 99, character_name: 'MockUser', message, created_at: new Date().toISOString() })
      chat.updated_at = new Date().toISOString()
      return Promise.resolve({ data: { ...chat, messages: [...chat.messages] } })
    }
    return client.post<TradeChat>(`/chats/${chatId}/messages`, { message })
  },

  // 取引成立：このチャットをdealにし、同じ出品の他のopenチャットをdeclinedに
  deal: (chatId: number): Promise<{ data: TradeChat[] }> => {
    if (USE_MOCK) {
      const chat = mockChats.find((c) => c.id === chatId)!
      chat.status = 'deal'
      // 同じ出品の他のopenチャットを見送りに
      mockChats
        .filter((c) => c.listing_id === chat.listing_id && c.id !== chatId && c.status === 'open')
        .forEach((c) => { c.status = 'declined' })
      return Promise.resolve({ data: mockChats.filter((c) => c.listing_id === chat.listing_id) })
    }
    return client.post<TradeChat[]>(`/chats/${chatId}/deal`)
  },

  // 見送り
  decline: (chatId: number): Promise<{ data: TradeChat }> => {
    if (USE_MOCK) {
      const chat = mockChats.find((c) => c.id === chatId)!
      chat.status = 'declined'
      return Promise.resolve({ data: { ...chat } })
    }
    return client.post<TradeChat>(`/chats/${chatId}/decline`)
  },

  // 再オープン
  reopen: (chatId: number): Promise<{ data: TradeChat }> => {
    if (USE_MOCK) {
      const chat = mockChats.find((c) => c.id === chatId)!
      chat.status = 'open'
      return Promise.resolve({ data: { ...chat } })
    }
    return client.post<TradeChat>(`/chats/${chatId}/reopen`)
  },

  // 取引不成立
  dealFailed: (chatId: number, relist: boolean): Promise<{ data: TradeChat }> =>
    client.post<TradeChat>(`/chats/${chatId}/deal-failed`, { relist }),

  // 受け渡し完了
  markComplete: (chatId: number): Promise<{ data: TradeChat }> =>
    client.post<TradeChat>(`/chats/${chatId}/complete`),
}
