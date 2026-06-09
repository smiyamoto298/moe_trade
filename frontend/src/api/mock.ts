// バックエンド未接続時のモックデータ
// backend が完成したら src/api/client.ts の USE_MOCK を false にする

import type { Paginated, Listing, ItemCategory, BonusEffectType, TradeChat, User } from '../types'

export const USE_MOCK = false

// アイテムマスタのモックデータ（管理画面用）
import type { Item } from '../types'
export const mockItems: Item[] = [
  {
    id: 1, category: { id: 11, parent_id: 1, name: '刀剣', sort_order: 1 },
    name: '炎の大剣', description: '炎属性を持つ強力な大剣',
    image_url: null,
    base_stats: { atk: 180, res_fire: 20 },
    special_conditions: ['ND'],
    dyeable: null, mithril: false, exclusive_skill: false, is_equipment_set: false, set_piece_category_ids: null, skill_requirements: null,
    verified_status: 'verified', submitted_by: null, locked_by_staff: true,
    bonus_effects: [{ id: 1, effect_name: '炎の魔剣', type: { id: 10, type_key: 'element_fire', label: '火属性強化', category: 'attack' }, values: [{ value: 15, value_unit: '%', label: '火属性ダメージ' }], description: '火属性ダメージ+15%' }],
  },
  {
    id: 2, category: { id: 22, parent_id: 2, name: '胴', sort_order: 2 },
    name: '魔術師のローブ', description: '魔力を大幅に高める上級ローブ',
    image_url: null,
    base_stats: { mag: 120, max_mp: 200 },
    special_conditions: ['NT', 'OP'],
    dyeable: null, mithril: false, exclusive_skill: false, is_equipment_set: false, set_piece_category_ids: null, skill_requirements: null,
    verified_status: 'unverified', submitted_by: 2, locked_by_staff: false,
    bonus_effects: [{ id: 2, effect_name: '大賢者の知識', type: { id: 1, type_key: 'magic_dmg_up', label: '魔法ダメージ増加', category: 'magic' }, values: [{ value: 10, value_unit: '%', label: '魔法ダメージ' }], description: '魔法ダメージ+10%' }],
  },
  {
    id: 3, category: { id: 34, parent_id: 3, name: '指(装)', sort_order: 4 },
    name: '速度の指輪', description: '移動速度を高める指輪',
    image_url: null,
    base_stats: { move_speed: 10, eva: 15 },
    special_conditions: [],
    dyeable: null, mithril: false, exclusive_skill: false, is_equipment_set: false, set_piece_category_ids: null, skill_requirements: null,
    verified_status: 'verified', submitted_by: null, locked_by_staff: true,
    bonus_effects: [{ id: 3, effect_name: '高速鉄道', type: { id: 5, type_key: 'move_speed', label: '移動速度上昇', category: 'speed' }, values: [{ value: 20, value_unit: '%', label: '移動速度' }], description: '移動速度+20%' }],
  },
  {
    id: 4, category: { id: 13, parent_id: 1, name: '槍', sort_order: 3 },
    name: '雷神の槍', description: '',
    image_url: null,
    base_stats: { atk: 210, hit: 30 },
    special_conditions: [],
    dyeable: null, mithril: false, exclusive_skill: false, is_equipment_set: false, set_piece_category_ids: null, skill_requirements: null,
    verified_status: 'unverified', submitted_by: 5, locked_by_staff: false,
    bonus_effects: [],
  },
]

export const mockCategories: ItemCategory[] = [
  {
    id: 1, parent_id: null, name: '武器', sort_order: 1,
    children: [
      { id: 11, parent_id: 1, name: '刀剣', sort_order: 1 },
      { id: 12, parent_id: 1, name: 'こん棒', sort_order: 2 },
      { id: 13, parent_id: 1, name: '槍', sort_order: 3 },
      { id: 14, parent_id: 1, name: '銃器', sort_order: 4 },
      { id: 15, parent_id: 1, name: '投げ', sort_order: 5 },
      { id: 16, parent_id: 1, name: '弓', sort_order: 6 },
      { id: 17, parent_id: 1, name: '素手', sort_order: 7 },
    ],
  },
  {
    id: 2, parent_id: null, name: '防具', sort_order: 2,
    children: [
      { id: 21, parent_id: 2, name: '頭', sort_order: 1 },
      { id: 22, parent_id: 2, name: '胴', sort_order: 2 },
      { id: 23, parent_id: 2, name: '手', sort_order: 3 },
      { id: 24, parent_id: 2, name: 'パ', sort_order: 4 },
      { id: 25, parent_id: 2, name: '靴', sort_order: 5 },
      { id: 26, parent_id: 2, name: '肩', sort_order: 6 },
      { id: 27, parent_id: 2, name: '腰', sort_order: 7 },
    ],
  },
  {
    id: 3, parent_id: null, name: '装飾品', sort_order: 3,
    children: [
      { id: 31, parent_id: 3, name: '頭(装)', sort_order: 1 },
      { id: 32, parent_id: 3, name: '顔(装)', sort_order: 2 },
      { id: 33, parent_id: 3, name: '耳(装)', sort_order: 3 },
      { id: 34, parent_id: 3, name: '指(装)', sort_order: 4 },
      { id: 35, parent_id: 3, name: '胸(装)', sort_order: 5 },
      { id: 36, parent_id: 3, name: '背中(装)', sort_order: 6 },
      { id: 37, parent_id: 3, name: '腰(装)', sort_order: 7 },
    ],
  },
]

export const mockBonusTypes: BonusEffectType[] = [
  { id: 1,  type_key: 'magic_dmg_up',      label: '魔法ダメージ増加',   category: 'magic' },
  { id: 2,  type_key: 'physical_dmg_up',   label: '物理ダメージ増加',   category: 'attack' },
  { id: 3,  type_key: 'critical_rate_up',  label: 'クリティカル率上昇', category: 'attack' },
  { id: 4,  type_key: 'cast_speed',        label: '詠唱速度短縮',       category: 'magic' },
  { id: 5,  type_key: 'move_speed',        label: '移動速度上昇',       category: 'speed' },
  { id: 6,  type_key: 'regen_hp',          label: 'HP自然回復',         category: 'recovery' },
  { id: 7,  type_key: 'regen_mp',          label: 'MP自然回復',         category: 'recovery' },
  { id: 8,  type_key: 'phys_damage_reduce',label: '物理ダメージ軽減',   category: 'defense' },
  { id: 9,  type_key: 'magic_damage_reduce',label: '魔法ダメージ軽減', category: 'defense' },
  { id: 10, type_key: 'element_fire',      label: '火属性強化',         category: 'attack' },
]

const expires = new Date(Date.now() + 5 * 86400000).toISOString()

// mockItems を参照することでデータの二重管理を防ぐ
export const mockListings: Paginated<Listing> = {
  data: [
    {
      id: 1, user_id: 1,
      item: mockItems[0],
      price: 500000, currency: 'AC', quantity: 1, trade_type: 'fixed',
      comment: '即決のみ対応します', status: 'active', expires_at: expires,
      servers: [
        { server: 'Emerald', character_id: 1, character: { id: 1, character_name: 'SwordMaster' } },
        { server: 'Diamond', character_id: 2, character: { id: 2, character_name: 'SwordMaster2' } },
      ],
      created_at: new Date().toISOString(),
    },
    {
      id: 2, user_id: 2,
      item: mockItems[1],
      price: 1200000, currency: 'AC', quantity: 1, trade_type: 'negotiable',
      comment: '交渉歓迎。まずは声をかけてください', status: 'active', expires_at: expires,
      servers: [{ server: 'Pearl', character_id: 3, character: { id: 3, character_name: 'MageKing' } }],
      created_at: new Date().toISOString(),
    },
    {
      id: 3, user_id: 3,
      item: mockItems[2],
      price: 80000, currency: 'AC', quantity: 3, trade_type: 'fixed',
      comment: '3個まとめて売ります', status: 'active',
      expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      servers: [
        { server: 'Emerald', character_id: 4, character: { id: 4, character_name: 'RingDealer' } },
        { server: 'Diamond', character_id: 5, character: { id: 5, character_name: 'RingDealer' } },
        { server: 'Pearl', character_id: 6, character: { id: 6, character_name: 'RingDealer' } },
      ],
      created_at: new Date().toISOString(),
    },
  ],
  current_page: 1, last_page: 1, per_page: 20, total: 3,
}

// 価格解析モックデータ
import type { ItemPriceAnalytics } from '../types'

function daysAgo(d: number) {
  const dt = new Date()
  dt.setDate(dt.getDate() - d)
  return dt.toISOString()
}

export const mockPriceAnalytics: Record<number, ItemPriceAnalytics> = {
  1: {
    item_id: 1,
    stats: { min: 420000, max: 650000, avg: 512000, median: 500000, deal_count: 8, listing_count: 3 },
    history: [
      { date: '6/1',  min: 450000, max: 600000, median: 500000, avg: 516000, count: 2 },
      { date: '6/5',  min: 430000, max: 620000, median: 510000, avg: 520000, count: 3 },
      { date: '6/10', min: 420000, max: 650000, median: 495000, avg: 508000, count: 2 },
      { date: '6/15', min: 460000, max: 580000, median: 500000, avg: 505000, count: 1 },
    ],
    recent_deals: [
      { id: 1, price: 500000, currency: 'AC', server: 'Emerald', traded_at: daysAgo(3) },
      { id: 2, price: 480000, currency: 'AC', server: 'Diamond', traded_at: daysAgo(7) },
      { id: 3, price: 520000, currency: 'AC', server: 'Emerald', traded_at: daysAgo(12) },
      { id: 4, price: 450000, currency: 'AC', server: 'Pearl',   traded_at: daysAgo(18) },
      { id: 5, price: 600000, currency: 'AC', server: 'Emerald', traded_at: daysAgo(25) },
    ],
    recent_listings: [
      { price: 500000, currency: 'AC', trade_type: 'fixed',      listed_at: daysAgo(1) },
      { price: 480000, currency: 'AC', trade_type: 'negotiable', listed_at: daysAgo(2) },
      { price: 550000, currency: 'AC', trade_type: 'fixed',      listed_at: daysAgo(4) },
    ],
  },
  2: {
    item_id: 2,
    stats: { min: 900000, max: 1500000, avg: 1150000, median: 1200000, deal_count: 3, listing_count: 1 },
    history: [
      { date: '5/20', min: 1000000, max: 1400000, median: 1200000, avg: 1200000, count: 1 },
      { date: '6/1',  min:  900000, max: 1500000, median: 1150000, avg: 1133000, count: 2 },
    ],
    recent_deals: [
      { id: 6, price: 1200000, currency: 'AC', server: 'Pearl', traded_at: daysAgo(10) },
      { id: 7, price:  900000, currency: 'AC', server: 'Pearl', traded_at: daysAgo(20) },
    ],
    recent_listings: [
      { price: 1200000, currency: 'AC', trade_type: 'negotiable', listed_at: daysAgo(1) },
    ],
  },
  3: {
    item_id: 3,
    stats: { min: 60000, max: 100000, avg: 78000, median: 80000, deal_count: 12, listing_count: 3 },
    history: [
      { date: '5/15', min: 70000, max: 100000, median: 85000, avg: 85000, count: 3 },
      { date: '6/1',  min: 60000, max:  90000, median: 75000, avg: 73000, count: 4 },
      { date: '6/10', min: 65000, max:  95000, median: 80000, avg: 78000, count: 5 },
    ],
    recent_deals: [
      { id: 8,  price: 80000, currency: 'AC', server: 'Emerald', traded_at: daysAgo(2)  },
      { id: 9,  price: 75000, currency: 'AC', server: 'Diamond', traded_at: daysAgo(5)  },
      { id: 10, price: 85000, currency: 'AC', server: 'Pearl',   traded_at: daysAgo(8)  },
      { id: 11, price: 70000, currency: 'AC', server: 'Emerald', traded_at: daysAgo(14) },
    ],
    recent_listings: [
      { price: 80000, currency: 'AC', trade_type: 'fixed',      listed_at: daysAgo(1) },
      { price: 75000, currency: 'AC', trade_type: 'fixed',      listed_at: daysAgo(2) },
      { price: 90000, currency: 'AC', trade_type: 'negotiable', listed_at: daysAgo(3) },
    ],
  },
}

// モックユーザー一覧（管理画面用）
export const mockUsers: User[] = [
  { id: 99,  email: 'mock@example.com',   role: 'admin',  is_suspended: false, email_verified_at: new Date().toISOString(), register_ip: '192.168.1.1',  characters: [{ id: 1, server: 'Emerald', character_name: 'MockUser' }] },
  { id: 1,   email: 'sword@example.com',  role: 'user',   is_suspended: false, email_verified_at: new Date().toISOString(), register_ip: '203.0.113.10', characters: [{ id: 2, server: 'Emerald', character_name: 'SwordMaster' }] },
  { id: 2,   email: 'mage@example.com',   role: 'editor', is_suspended: false, email_verified_at: new Date().toISOString(), register_ip: '203.0.113.20', characters: [{ id: 3, server: 'Pearl',   character_name: 'MageKing' }] },
  { id: 3,   email: 'ring@example.com',   role: 'user',   is_suspended: false, email_verified_at: new Date().toISOString(), register_ip: '203.0.113.30', characters: [{ id: 4, server: 'Emerald', character_name: 'RingDealer' }, { id: 5, server: 'Diamond', character_name: 'RingDealer' }] },
  // 以下2件は同一IP → 多重アカウントとして自動停止
  { id: 10,  email: 'alpha@example.com',  role: 'user',   is_suspended: true,  email_verified_at: new Date().toISOString(), register_ip: '198.51.100.5', characters: [{ id: 6, server: 'Emerald', character_name: 'BuyerAlpha' }] },
  { id: 11,  email: 'beta@example.com',   role: 'user',   is_suspended: true,  email_verified_at: new Date().toISOString(), register_ip: '198.51.100.5', characters: [{ id: 7, server: 'Diamond', character_name: 'BuyerBeta' }] },
]

// モックチャット（export で外部から push 可能にする）
// id:99 = 自分（MockUser）
// listing_id:1,2 の出品者は id:1（SwordMaster） → 自分が買い手のチャット
// listing_id:3 の出品者は id:3（RingDealer）    → 自分が売り手のチャット
export const mockChats: TradeChat[] = [
  // 自分が買い手 — 出品1への取引希望（相手から未読メッセージあり）
  {
    id: 1,
    listing_id: 1,
    buyer_id: 99,
    buyer_character_name: 'MockUser',
    server: 'Emerald' as const,
    status: 'open',
    seller_completed: false,
    buyer_completed: false,
    messages: [
      { id: 1, chat_id: 1, user_id: 99, character_name: 'MockUser',    message: '炎の大剣に興味があります！まだ売れていますか？', created_at: new Date(Date.now() - 3600000).toISOString() },
      { id: 2, chat_id: 1, user_id: 1,  character_name: 'SwordMaster', message: 'はい、まだ売り出し中です！ぜひどうぞ', created_at: new Date(Date.now() - 1800000).toISOString() },
    ],
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 1800000).toISOString(),
  },
  // 自分が買い手 — 出品2への取引希望（自分が最後に送信・既読）
  {
    id: 2,
    listing_id: 2,
    buyer_id: 99,
    buyer_character_name: 'MockUser',
    server: 'Pearl' as const,
    status: 'open',
    seller_completed: false,
    buyer_completed: false,
    messages: [
      { id: 3, chat_id: 2, user_id: 99, character_name: 'MockUser', message: '値段の交渉は可能ですか？', created_at: new Date(Date.now() - 7200000).toISOString() },
    ],
    created_at: new Date(Date.now() - 7200000).toISOString(),
    updated_at: new Date(Date.now() - 7200000).toISOString(),
  },
  // 自分が売り手 — 出品3への取引希望（買い手から未読メッセージあり）
  {
    id: 3,
    listing_id: 3,
    buyer_id: 10,
    buyer_character_name: 'BuyerAlpha',
    server: 'Emerald' as const,
    status: 'open',
    seller_completed: false,
    buyer_completed: false,
    messages: [
      { id: 4, chat_id: 3, user_id: 10, character_name: 'BuyerAlpha', message: '速度の指輪を3個全部買いたいのですが', created_at: new Date(Date.now() - 900000).toISOString() },
    ],
    created_at: new Date(Date.now() - 900000).toISOString(),
    updated_at: new Date(Date.now() - 900000).toISOString(),
  },
]

// 自分のuser_id（モック）
export const MOCK_MY_USER_ID = 99
// 自分が出品者の listing_id 一覧（モック）
export const MOCK_MY_LISTING_IDS = [3]
