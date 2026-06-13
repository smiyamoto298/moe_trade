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
  // 出品・買取登録時に取引可能サーバーを既定チェックするデフォルトキャラ。
  is_default?: boolean
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
  // この付加効果が専用技か（装備セットの部位では付加効果ごとに設定）。古いレスポンスでは未定義
  is_exclusive?: boolean
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
  // 装備セットの構成部位（通常アイテムとして登録された部位）。セット本体のときのみ存在。
  set_members?: Item[]
  skill_requirements: Record<string, number> | null
  // テクニックの発動に必要なマスタリのコード配列（例: ["WAR"]）。テクニック以外では null。
  mastery_requirements: string[] | null
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
  // ---- 取引情報（一覧取得時に付与。募集中=active の件数） ----
  active_listing_count?: number      // 出品数
  active_buy_request_count?: number  // 買取数
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
  /** 現在の取引希望者数（順番待ち人数）。詳細取得時のみ付与。 */
  waiting_count?: number
}

// ---- 買取（買いたい） ----
export interface BuyRequest {
  id: number
  user_id: number
  item: Item
  price: number
  currency: string
  quantity: number
  trade_type: TradeType
  comment: string
  status: ListingStatus
  expires_at: string
  servers: ListingServer[]
  created_at: string
  /** 現在の売却申し出者数（順番待ち人数）。詳細取得時のみ付与。 */
  waiting_count?: number
}

export interface BuyRequestSearchParams {
  item_name?: string
  item_names?: string[]
  trade_type?: TradeType
  price_min?: number
  price_max?: number
  servers?: Server[]
  include_completed?: boolean
  sort?: string
  page?: number
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

export interface PriceOffer {
  price: number
  currency: string
  trade_type: string
  listed_at: string
}

// 売り相場（出品由来）/ 買い相場（買取由来）の分割分析
export interface PriceMarketSection {
  stats: PriceStats
  history: PriceHistory[]
  recent_deals: TradeRecord[]
  recent_offers: PriceOffer[]
}

export interface ItemPriceAnalytics {
  item_id: number
  stats: PriceStats
  history: PriceHistory[]
  recent_deals: TradeRecord[]
  recent_listings: PriceOffer[]
  /** 売り相場（出品由来）。古いレスポンスでは未定義 */
  sell?: PriceMarketSection
  /** 買い相場（買取由来）。古いレスポンスでは未定義 */
  buy?: PriceMarketSection
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
  // スキル検索モード。'normal'=指定スキルを含むテクニック / 'composition'=必要スキル・マスタリ構成スキルが全て検索条件内。既定は 'normal'。
  skill_match?: 'normal' | 'composition'
  // 通常検索で、指定スキルを構成に含むマスタリを必要とするテクニックも対象にするか。
  skill_include_mastery?: boolean
  special_conditions?: string[]
  sort?: string  // 'newest' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stat_asc:{key}' | 'stat_desc:{key}' | 'bonus_asc:{label}' | 'bonus_desc:{label}'
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
  listing_id?: number | null
  buy_request_id?: number | null
  source_type?: 'listing' | 'buy_request'
  buyer_id: number
  buyer?: { id: number; email: string }
  buyer_character_name: string
  listing?: Listing | null
  buy_request?: BuyRequest | null
  server: Server
  status: ChatStatus
  seller_completed: boolean
  buyer_completed: boolean
  messages: TradeMessage[]
  created_at: string
  updated_at: string
  // ---- 順番待ち（先着順キュー）情報 ----
  /** open キュー内での順位（1始まり）。open 以外や未付与のときは null/undefined。 */
  queue_position?: number | null
  /** その取引対象の open チャット総数（＝待ち人数）。 */
  queue_total?: number
  /** owner 視点で2番目以降の順番待ち（匿名・操作不可）かどうか。 */
  is_locked?: boolean
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

// 自分のアクティブな出品・買取件数（item_id ごと、JSONキーは文字列）
export interface MyItemCounts {
  listings: Record<string, number>
  buy_requests: Record<string, number>
}

// ---- お知らせ ----
export type AnnouncementLevel = 'info' | 'warning' | 'error'

export interface Announcement {
  id: number
  message: string
  level: AnnouncementLevel
  link_url: string | null
  link_label: string | null
  is_active: boolean
  sort_order: number
  display_days: number | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

// ---- ページネーション ----
export interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}
