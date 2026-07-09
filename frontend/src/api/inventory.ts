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

// サーバーが返すユーザーごとのカスタム種別。クライアントは id を `ct_${id}` に変換して扱う。
export interface InventoryServerCustomType {
  id: number
  name: string
  sort_order: number
}

// サーバーが返す種別割当（custom_type_id はカスタム種別のサーバー id）。
export interface InventoryServerExclusion {
  name: string
  exclusion_type_id: number | null
  custom_type_id?: number | null
}

export interface InventorySnapshot {
  // 保存先モード（local / db）。ユーザー単位でサーバーが正を持つ。
  storage_mode: 'local' | 'db'
  accounts: InventoryServerAccount[]
  items: InventoryServerItem[]
  // ユーザーの種別割当（name→種別）。後方互換のため文字列配列も受け付けるが、サーバーは常にオブジェクトで返す。
  exclusions: InventoryServerExclusion[]
  // ユーザーごとのカスタム種別（旧サーバー互換のため省略可）
  custom_types?: InventoryServerCustomType[]
}

// PUT で全置換するペイロード。アカウントとカスタム種別はクライアントキー（key）で参照する。
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
  // 種別割当。custom_type_key はカスタム種別のクライアントキー（custom_types[].key）を指す
  exclusions: { name: string; exclusion_type_id: number | null; custom_type_key: string | null }[]
  custom_types: { key: string; name: string; sort_order: number }[]
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
