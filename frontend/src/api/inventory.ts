import client from './client'
import type { Item } from '../types'

// サーバーが返す所持品スナップショットの型（DB保存時）。
export interface InventoryServerAccount {
  id: number
  name: string
  sort_order: number
}

export interface InventoryServerItem {
  id: number
  moe_account_id: number | null
  item_id: number | null
  no: string | null
  name: string
  category: string | null
  count: number
  price: number | null
  is_worn: boolean
  is_dyed: boolean
  is_marked: boolean
  note: string | null
  sort_order: number
  item: Item | null
}

export interface InventorySnapshot {
  // 保存先モード（local / db）。ユーザー単位でサーバーが正を持つ。
  storage_mode: 'local' | 'db'
  accounts: InventoryServerAccount[]
  items: InventoryServerItem[]
  exclusions: string[]
}

// PUT で全置換するペイロード。アカウントはクライアントキー（key）で参照する。
export interface InventoryPutPayload {
  accounts: { key: string; name: string; sort_order: number }[]
  items: {
    account_key: string | null
    item_id: number | null
    no: string
    name: string
    category: string
    count: number
    is_worn: boolean
    is_dyed: boolean
    is_marked: boolean
    note: string
    sort_order: number
  }[]
  exclusions: string[]
}

export const inventoryApi = {
  get: (): Promise<{ data: InventorySnapshot }> =>
    client.get<InventorySnapshot>('/mypage/inventory'),

  // 本番（さくら）の WAF が実ボディ付き PUT を 403 で弾くため、POST + メソッド
  // オーバーライドで送る（board.updatePost と同じホスト対策）。ルートは PUT のまま。
  replace: (payload: InventoryPutPayload): Promise<{ data: InventorySnapshot }> =>
    client.post<InventorySnapshot>('/mypage/inventory', payload, {
      headers: { 'X-HTTP-Method-Override': 'PUT' },
    }),

  // 保存先モードをユーザー単位でサーバーに記憶させる。
  // replace と同様、本番 WAF の PUT 対策で POST + メソッドオーバーライドで送る。
  setMode: (mode: 'local' | 'db'): Promise<{ data: { storage_mode: 'local' | 'db' } }> =>
    client.post<{ storage_mode: 'local' | 'db' }>('/mypage/inventory/storage-mode', { mode }, {
      headers: { 'X-HTTP-Method-Override': 'PUT' },
    }),
}
