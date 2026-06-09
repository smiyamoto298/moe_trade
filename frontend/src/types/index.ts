// ---- ユーザー ----
export type UserRole = 'user' | 'editor' | 'admin'

export interface User {
  id: number
  email: string
  role: UserRole
  is_suspended: boolean
  email_verified_at: string | null
  register_ip: string | null
  characters: UserCharacter[]
}

export interface UserCharacter {
  id: number
  server: Server
  character_name: string
}

// ---- サーバー ----
export type Server = 'Emerald' | 'Diamond' | 'Pearl'
export const SERVERS: Server[] = ['Emerald', 'Diamond', 'Pearl']

// ---- アイテム ----
export type VerifiedStatus = 'unverified' | 'verified'

export interface ItemCategory {
  id: number
  parent_id: number | null
  name: string
  sort_order: number
  children?: ItemCategory[]
}

export interface BonusEffectType {
  id: number
  type_key: string
  label: string
  category: string
}

export interface BonusEffectValue {
  value: number
  value_unit: string  // '%' | 'fixed' | 'x' | 'per_min'
  label?: string      // 何の数値か（例: "物理ダメージ", "命中"）
}

export interface ItemBonusEffect {
  id: number
  effect_name: string
  type: BonusEffectType
  values: BonusEffectValue[]  // 複数の数値
  description: string
}

export interface Item {
  id: number
  category: ItemCategory
  name: string
  description: string
  image_url: string | null
  base_stats: Record<string, number>
  special_conditions: string[]
  dyeable: boolean | null
  mithril: boolean
  exclusive_skill: boolean
  is_equipment_set: boolean
  set_piece_category_ids: number[] | null
  skill_requirements: Record<string, number> | null
  // ---- アセット固有（装備品・テクニックでは null） ----
  placement?: AssetPlacement | null      // 設置個所: 床 / 壁 / 天井
  asset_width?: number | null            // サイズ: 横
  asset_height?: number | null           // サイズ: 縦
  storage_count?: number | null          // ストレージ数
  special_function?: AssetFunction | null // 特殊機能（単一）
  verified_status: VerifiedStatus
  submitted_by: number | null
  // editor/admin が編集・確認すると true。true の間は登録者(user)が上書き編集できない（排他制御）。
  locked_by_staff: boolean
  bonus_effects: ItemBonusEffect[]
}

// ---- アセット ----
export type AssetPlacement = '床' | '壁' | '天井'
export type AssetFunction = '販売員' | '銀行' | 'タイプカプセル' | '栽培' | '生産施設' | 'カタログ'

// ---- 種別（一覧タブ） ----
export type ItemType = 'equipment' | 'technique' | 'asset'

// ---- 出品 ----
export type TradeType = 'fixed' | 'negotiable'
export type ListingStatus = 'active' | 'expired' | 'cancelled' | 'completed' | 'deal_failed'

export interface ListingServer {
  server: Server
  character_id: number | null
  character?: { id: number; character_name: string } | null
}

export interface Listing {
  id: number
  user_id: number
  item: Item
  price: number
  currency: string
  quantity: number
  trade_type: TradeType
  comment: string
  /** 削れあり（耐久度に削れがある中古品）。古いレスポンスでは未定義 */
  is_worn?: boolean
  status: ListingStatus
  expires_at: string
  servers: ListingServer[]
  created_at: string
}

// ---- 相場 ----
export interface PriceHistory {
  date: string
  min: number
  max: number
  median: number
  avg: number
  count: number
}

export interface TradeRecord {
  id: number
  price: number
  currency: string
  server: Server
  traded_at: string
  /** 相場データとして有効か（同一IP取引は false）。古いレスポンスでは未定義 */
  is_valid?: boolean
  /** データの出所。'trade' = サイト内取引、'manual' = 他サイト相場の手動登録 */
  source?: 'trade' | 'manual'
}

export interface PriceStats {
  min: number
  max: number
  avg: number
  median: number
  deal_count: number    // 取引成立件数
  listing_count: number // 現在の出品数
}

export interface ItemPriceAnalytics {
  item_id: number
  stats: PriceStats
  history: PriceHistory[]
  recent_deals: TradeRecord[]
  recent_listings: { price: number; currency: string; trade_type: string; listed_at: string }[]
}

export interface StatRange {
  min?: number
  max?: number
}

// ---- 検索パラメータ ----
export interface ListingSearchParams {
  item_name?: string
  category_ids?: number[]
  include_equipment_set?: boolean
  include_completed?: boolean
  is_skill?: boolean
  item_type?: ItemType
  placements?: AssetPlacement[]
  special_functions?: AssetFunction[]
  storage_min?: number
  storage_max?: number
  servers?: Server[]
  trade_type?: TradeType
  exclude_worn?: boolean
  price_min?: number
  price_max?: number
  bonus_effect_names?: string[]
  bonus_value_keys?: string[]
  bonus_value_ranges?: Record<string, StatRange>
  base_stat_keys?: string[]
  base_stat_ranges?: Record<string, StatRange>
  skill_keys?: string[]
  skill_ranges?: Record<string, StatRange>
  special_conditions?: string[]
  sort?: string  // 'newest' | 'price_asc' | 'price_desc' | 'stat_asc:{key}' | 'stat_desc:{key}' | 'bonus_asc:{label}' | 'bonus_desc:{label}'
  page?: number
}

// ---- チャット ----
export type ChatStatus = 'open' | 'deal' | 'declined' | 'deal_failed'

export interface TradeMessage {
  id: number
  chat_id: number
  user_id: number
  character_name: string
  message: string
  created_at: string
}

export interface TradeChat {
  id: number
  listing_id: number
  buyer_id: number
  buyer?: { id: number; email: string }
  buyer_character_name: string
  server: Server
  status: ChatStatus
  seller_completed: boolean
  buyer_completed: boolean
  messages: TradeMessage[]
  created_at: string
  updated_at: string
}

// ---- 運営掲示板 ----
export type BoardThreadStatus = 'open' | 'resolved'

export interface BoardThreadSummary {
  id: number
  title: string
  status: BoardThreadStatus
  admin_only: boolean
  user_id: number
  author_name: string
  post_count: number
  created_at: string
  last_active_at: string
}

export interface BoardPost {
  id: number
  user_id: number
  author_name: string
  message: string
  image_url?: string | null
  created_at: string
  updated_at?: string
}

export interface BoardThread {
  id: number
  title: string
  status: BoardThreadStatus
  admin_only: boolean
  user_id: number
  author_name: string
  created_at: string
  posts: BoardPost[]
}

// ---- ページネーション ----
export interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}
