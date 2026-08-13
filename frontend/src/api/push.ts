import client from './client'

// Web Push 購読の登録・解除。保存されるのはブラウザが発行した購読情報
// （エンドポイントURL・暗号化鍵）のみで、個人情報は送らない。
export interface PushSubscriptionPayload {
  endpoint: string
  keys: { p256dh?: string; auth?: string }
}

export const pushApi = {
  publicKey: () => client.get<{ public_key: string | null }>('/push/public-key'),
  subscribe: (payload: PushSubscriptionPayload) => client.post('/push/subscriptions', payload),
  unsubscribe: (endpoint: string) => client.delete('/push/subscriptions', { data: { endpoint } }),
}
