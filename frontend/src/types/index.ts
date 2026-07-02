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
  // 'text' のときは文字列、'checking' のときは値なし('')。それ以外は数値。
  value: number | string
  value_unit: string  // '%' | 'fixed' | 'x' | 'per_min' | 'text'（テキスト） | 'checking'（確認中）
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
  // WarAgeでは効果がない付加効果か。true のとき説明末尾に注記を表示する。古いレスポンスでは未定義
  no_warage_effect?: boolean
}

// アイテムのハッシュタグ。is_fixed=true は admin/editor 管理の固定タグ（ユーザー削除不可）。
export interface ItemHashtag {
  id: number
  tag: string
  is_fixed: boolean
  created_by?: number | null
}

// レシピの1エントリ。レシピ名・そのレシピ名専用の必要スキル値を持つ。
export interface RecipeEntry {
  name: string | null
  skill_requirements: Record<string, number>
}

export interface Item {
  id: number
  category: ItemCategory
  name: string
  description: string
  image_url: string | null
  // 公式DB: MasterOfEpic公式サイト（moepic.com）のアイテムページへのリンク
  official_url: string | null
  base_stats: Record<string, number>
  special_conditions: string[]
  dyeable: boolean | null
  mithril: boolean
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
  // ---- 「その他」種別固有（該当種別以外では null） ----
  pet_name?: string | null               // 未開封ペット: ペット名
  recipe_name?: string | null            // レシピ: レシピ名（recipe_entries 第1エントリからの派生互換値）
  recipe_binder?: string | null          // レガシー: レシピはバインダーを持たなくなった（列は残置・常に null）
  // レシピ: {レシピ名, 必要スキル値} の組を複数保持。レシピ以外では null/未定義。
  recipe_entries?: RecipeEntry[] | null
  verified_status: VerifiedStatus
  submitted_by: number | null
  // editor/admin が編集・確認すると true。true の間は登録者(user)が上書き編集できない（排他制御）。
  locked_by_staff: boolean
  bonus_effects: ItemBonusEffect[]
  // ハッシュタグ（一覧・詳細取得時に付与）。固定タグ→ユーザータグの順。
  hashtags?: ItemHashtag[]
  // ---- 取引情報（一覧取得時に付与。募集中=active の件数） ----
  active_listing_count?: number      // 出品数
  active_buy_request_count?: number  // 買取数
  // ---- タイムスタンプ（一覧の並び替え用。新着順=created_at / 更新順=updated_at） ----
  created_at?: string
  updated_at?: string
}

// ---- アセット ----
export type AssetPlacement = '床' | '壁' | '天井'
export type AssetFunction = '販売員' | '銀行' | 'タイプカプセル' | '栽培' | '生産施設' | 'カタログ'

// ---- 種別（一覧タブ） ----
export type ItemType = 'equipment' | 'technique' | 'asset' | 'other'

// ---- 出品 ----
export type TradeType = 'fixed' | 'negotiable' | 'auction'
export type ListingStatus = 'active' | 'expired' | 'cancelled' | 'completed' | 'deal_failed'

/** オークションの現在状況（出品/買取の詳細・一覧レスポンスに付与） */
export interface AuctionInfo {
  /** 即決価格（任意） */
  buyout_price?: number | null
  /** 現在価格（最良入札 or 開始価格 price） */
  current_price?: number | null
  /** 現在の最良入札（無ければ null） */
  best_bid?: number | null
  /** 入札数 */
  bid_count?: number
}

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
  /** 染色済み。古いレスポンスでは未定義 */
  is_dyed?: boolean
  status: ListingStatus
  expires_at: string
  servers: ListingServer[]
  created_at: string
  /** 現在の取引希望者数（順番待ち人数）。詳細取得時のみ付与。 */
  waiting_count?: number
  /** 即決価格（オークションのみ）。 */
  buyout_price?: number | null
  /** オークションの現在価格（最良入札 or 開始価格）。一覧/詳細で付与。 */
  current_price?: number | null
  /** オークションの最良入札（無ければ null）。 */
  best_bid?: number | null
  /** オークションの入札数。 */
  bid_count?: number
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
  /** 即決価格（オークションのみ）。 */
  buyout_price?: number | null
  /** オークションの現在価格（最良入札 or 開始価格）。一覧/詳細で付与。 */
  current_price?: number | null
  /** オークションの最良入札（無ければ null）。 */
  best_bid?: number | null
  /** オークションの入札数。 */
  bid_count?: number
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
  /** 出品 or 買取の id（各行から詳細ページへリンクするため）。古いレスポンスでは未定義 */
  id?: number
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
  // ハッシュタグでの絞り込み（タグ名・完全一致）
  hashtag?: string
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
  /** オークションの入札額（入札チャットのみ）。 */
  bid_price?: number | null
  /** より有利な入札に抜かれた時刻（オークション・価格更新通知用）。 */
  outbid_at?: string | null
  /** 落札価格（自分が不成立=declined になったオークションの落札額。落札落選通知用）。 */
  won_price?: number | null
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

export type BoardThreadCategory = 'item_correction' | 'request' | 'bug' | 'other'

export interface BoardThreadSummary {
  id: number
  title: string
  status: BoardThreadStatus
  category: BoardThreadCategory
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
  category: BoardThreadCategory
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
  // 出品中の件数を (item_id, 削れ, 染色) 単位で集計。キーは "<item_id>:<削れ 0/1>:<染色 0/1>"。
  listing_variants?: Record<string, number>
}

// ---- 所有アイテム管理（マイページ） ----
// クライアント側の表現。id はクライアント生成の文字列キー（DB保存時はサーバーがキー→IDへ対応づける）。
export interface MoeAccount {
  id: string
  name: string
}

export interface OwnedItem {
  id: string
  // 所属 MoE アカウント（未割り当ては null）
  accountId: string | null
  // 貼り付け由来の生データ
  no: string
  name: string
  category: string
  count: number
  // 登録アイテムへの紐づけ（未紐づけは null）
  itemId: number | null
  item: Item | null
  // ステータス
  worn: boolean    // 削れあり
  dyed: boolean    // 染色済み
  marked: boolean  // マーク
  // ユーザーの自由記入メモ（未入力は空文字）
  note: string
}

// ユーザーが分類したアイテム名→表示種別（ジャンル）の割当。
// exclusion_type_id が null の行は既定種別「その他」とみなす。
// 旧「個別除外」を表示種別へ概念転換したもの（フィールド名は後方互換のため exclusions のまま）。
export interface UserTypeAssignment {
  name: string
  exclusion_type_id: number | null
}

export interface InventoryData {
  accounts: MoeAccount[]
  items: OwnedItem[]
  // ユーザーの種別割当（name→種別）
  exclusions: UserTypeAssignment[]
}

// 保存先（デフォルトはローカルストレージ）
export type InventoryStorageMode = 'local' | 'db'

// 共通除外アイテムの種別（カテゴリ）。管理者が任意で追加。既定は「その他」（is_default=true）。
export interface ExclusionType {
  id: number
  name: string
  is_default: boolean
  // まだ設定をいじっていないユーザーに既定で適用するか（管理者が設定するデフォルトON/OFF）。
  default_enabled: boolean
  sort_order: number
}

// 管理者が管理する共通の除外アイテム
export interface ExcludedItem {
  id: number
  name: string
  created_by: number | null
  // 所属する種別（既定種別なら「その他」の id）。古いレスポンスでは未定義
  exclusion_type_id: number | null
  created_at: string
}

// 公開: 共通除外アイテムと種別（貼り付け除外に使用）。
// items は種別IDを伴い、クライアントは「適用する種別」（端末ローカル設定）で絞り込む。
export interface ExcludedItemsPublic {
  types: ExclusionType[]
  items: { name: string; type_id: number }[]
}

// ユーザー個別の種別設定を集計した、共通の種別割当への昇格（共通化）候補。
// DB保存分は user_count（設定人数）、端末保存ユーザーの匿名報告分は from_device=true で合流する。
export interface UserExclusionSuggestion {
  name: string
  user_count: number
  from_device: boolean
  // 既に共通登録済みの場合の現在の共通種別ID（＝別種別への上書き候補）。新規候補は null
  current_type_id: number | null
  // ユーザーが最も多く割り当てた種別（共通化時の既定候補。新規候補で全員未指定なら null=その他。
  // 上書き候補は現在と異なる最頻種別＝具体ID）
  suggested_type_id: number | null
  // ユーザーが設定した種別の内訳（多い順。type_id が null は既定種別「その他」）
  type_assignments: { type_id: number | null; count: number }[]
}

// 「サーバ登録対象外」のシステム共通アイテム（管理者が登録）。
// ここに登録された名前は、保存先がサーバー（DB）でもローカルストレージにだけ保存する。
export interface ServerExcludedItem {
  id: number
  name: string
  created_by: number | null
  created_at: string
}

// 他ユーザーが買取中の価格（item_id ごと）。複数あるときは最高額と件数を返す。
export interface BuyPriceInfo {
  buy_request_id: number
  price: number
  currency: string
  count: number
}

// ---- お知らせ ----
export type AnnouncementLevel = 'info' | 'warning' | 'error'

// 表示対象。all=全員 / staff=管理・編集者のみ / specific=指定ユーザーのみ。
export type AnnouncementTargetType = 'all' | 'staff' | 'specific'

export interface Announcement {
  id: number
  message: string
  level: AnnouncementLevel
  link_url: string | null
  link_label: string | null
  link_new_tab: boolean
  is_active: boolean
  sort_order: number
  display_days: number | null
  expires_at: string | null
  target_type: AnnouncementTargetType
  // target_type='specific' のときの対象ユーザーID配列。それ以外は null。
  target_user_ids: number[] | null
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
