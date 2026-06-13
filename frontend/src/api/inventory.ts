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
  sort_order: number
  item: Item | null
}

export interface InventorySnapshot {
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
    sort_order: number
  }[]
  exclusions: string[]
}

export const inventoryApi = {
  get: (): Promise<{ data: InventorySnapshot }> =>
    client.get<InventorySnapshot>('/mypage/inventory'),

  replace: (payload: InventoryPutPayload): Promise<{ data: InventorySnapshot }> =>
    client.put<InventorySnapshot>('/mypage/inventory', payload),
}
