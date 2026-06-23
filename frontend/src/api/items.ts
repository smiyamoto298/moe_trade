import client from './client'
import { USE_MOCK, mockCategories, mockBonusTypes, mockItems, mockPriceAnalytics } from './mock'
import type { Item, ItemCategory, ItemHashtag, BonusEffectType, PriceHistory, ItemPriceAnalytics, AssetPlacement, AssetFunction } from '../types'

// 装備セットの構成部位（通常アイテムとして登録される）の入力。
export interface EquipmentSetPieceInput {
  id?: number              // 既存部位アイテムを更新する場合のID（新規は未指定）
  category_id: number      // 部位カテゴリ
  name: string             // 部位ごとの名前
  base_stats: Record<string, number>
  special_conditions: string[]
  dyeable?: boolean | null
  mithril?: boolean
  bonus_effects: {
    effect_name: string
    values: { value: number | string; value_unit: string; label?: string }[]
    description: string
    is_exclusive?: boolean
    no_warage_effect?: boolean
  }[]
}

export const itemsApi = {
  list: async (params?: { name?: string; category_id?: number }): Promise<{ data: Item[] }> => {
    if (USE_MOCK) {
      let result = [...mockItems]
      if (params?.name) result = result.filter((i) => i.name.includes(params.name!))
      if (params?.category_id) result = result.filter((i) => i.category.id === params.category_id)
      return { data: result }
    }
    // API はページネーション（最大200件/ページ）で返すため、last_page まで辿って全件を結合する。
    // 1ページ目だけ使うと51件目以降のアイテムが画面から消える（アイテム管理の未確認バッジ不一致の原因）。
    const all: Item[] = []
    let page = 1
    let lastPage = 1
    do {
      const r = await client.get<{ data: Item[]; last_page: number }>('/items', {
        params: { ...params, per_page: 200, page },
      })
      all.push(...r.data.data)
      lastPage = r.data.last_page
      page += 1
    } while (page <= lastPage)
    return { data: all }
  },

  // アイテム名（複数）をまとめて登録済みアイテムと照合する。
  // 戻り値は「入力名 → Item」のマップ（一致したものだけ）。
  matchNames: (names: string[]): Promise<{ data: Record<string, Item> }> => {
    if (USE_MOCK) {
      const map: Record<string, Item> = {}
      for (const raw of names) {
        const name = raw.trim()
        if (!name) continue
        const truncated = /(\.\.\.|…)\s*$/.test(name)
        const base = name.replace(/\s*(\.\.\.|…)\s*$/, '').trim()
        const found = truncated
          ? mockItems.find((i) => i.name.startsWith(base))
          : mockItems.find((i) => i.name === name)
        if (found) map[raw] = found
      }
      return Promise.resolve({ data: map })
    }
    return client
      .post<{ data: Record<string, Item> }>('/items/match', { names })
      .then((r) => ({ data: r.data.data }))
  },

  get: (id: number): Promise<{ data: Item }> => {
    if (USE_MOCK) {
      const item = mockItems.find((i) => i.id === id)!
      return Promise.resolve({ data: item })
    }
    return client.get<Item>(`/items/${id}`)
  },

  create: (data: {
    category_id: number
    name: string
    description: string
    base_stats: Record<string, number>
    special_conditions: string[]
    is_equipment_set?: boolean
    set_piece_category_ids?: number[]
    skill_requirements?: Record<string, number> | null
    mastery_requirements?: string[] | null
    dyeable?: boolean | null
    mithril?: boolean
    placement?: AssetPlacement | null
    asset_width?: number | null
    asset_height?: number | null
    storage_count?: number | null
    special_function?: AssetFunction | null
    pet_name?: string | null
    recipe_name?: string | null
    recipe_binder?: string | null
    bonus_effects?: {
      effect_name: string
      values: { value: number | string; value_unit: string; label?: string }[]
      description: string
      is_exclusive?: boolean
      no_warage_effect?: boolean
    }[]
    // 固定ハッシュタグ（admin/editor のみ反映）
    fixed_hashtags?: string[]
    // 通常（ユーザー追加）ハッシュタグ（ログインユーザーなら反映・wiki型）
    user_hashtags?: string[]
    // editor/admin が登録時に確認済み(true)/確認中(false)を選ぶ。一般ユーザーは無視される。
    verified?: boolean
    pieces?: EquipmentSetPieceInput[]
  }): Promise<{ data: Item }> => {
    if (USE_MOCK) {
      const allCategories = mockCategories.flatMap((c) => [c, ...(c.children ?? [])])
      const category = allCategories.find((c) => c.id === data.category_id)!
      const newItem: Item = {
        id: Date.now(),
        category,
        name: data.name,
        description: data.description,
        image_url: null,
        base_stats: data.base_stats,
        special_conditions: data.special_conditions,
        dyeable: null,
        mithril: data.mithril ?? false,
        is_equipment_set: data.is_equipment_set ?? false,
        set_piece_category_ids: data.set_piece_category_ids ?? null,
        set_members: [],
        skill_requirements: data.skill_requirements ?? null,
        mastery_requirements: data.mastery_requirements ?? null,
        placement: data.placement ?? null,
        asset_width: data.asset_width ?? null,
        asset_height: data.asset_height ?? null,
        storage_count: data.storage_count ?? null,
        special_function: data.special_function ?? null,
        verified_status: data.verified ? 'verified' : 'unverified',
        submitted_by: 99,
        locked_by_staff: data.verified ?? false,
        bonus_effects: [],
      }
      mockItems.push(newItem)
      return Promise.resolve({ data: newItem })
    }
    return client.post<Item>('/items', data)
  },

  update: (id: number, data: {
    category_id?: number
    name?: string
    description?: string
    base_stats?: Record<string, number>
    special_conditions?: string[]
    mithril?: boolean
    placement?: AssetPlacement | null
    asset_width?: number | null
    asset_height?: number | null
    storage_count?: number | null
    special_function?: AssetFunction | null
    pet_name?: string | null
    recipe_name?: string | null
    recipe_binder?: string | null
    is_equipment_set?: boolean
    set_piece_category_ids?: number[]
    bonus_effects?: {
      effect_name: string
      values: { value: number | string; value_unit: string; label?: string }[]
      description: string
      is_exclusive?: boolean
      no_warage_effect?: boolean
    }[]
    // 固定ハッシュタグ（admin/editor のみ反映）
    fixed_hashtags?: string[]
    // 通常（ユーザー追加）ハッシュタグ（ログインユーザーなら反映・wiki型）
    user_hashtags?: string[]
    pieces?: EquipmentSetPieceInput[]
  }): Promise<{ data: Item }> => {
    if (USE_MOCK) {
      const item = mockItems.find((i) => i.id === id)!
      if (data.name !== undefined) item.name = data.name
      if (data.description !== undefined) item.description = data.description
      if (data.base_stats !== undefined) item.base_stats = data.base_stats
      if (data.special_conditions !== undefined) item.special_conditions = data.special_conditions
      if (data.mithril !== undefined) item.mithril = data.mithril
      if (data.category_id !== undefined) {
        item.category = mockCategories.flatMap((c) => c.children ?? []).find((c) => c.id === data.category_id) ?? item.category
      }
      return Promise.resolve({ data: { ...item } })
    }
    return client.put<Item>(`/items/${id}`, data)
  },

  // 通常の部位アイテム(id)を、それ自身を構成部位に含む新しい装備セットへ変換する。
  // 元アイテムは部位として残るため、出品・取引などの紐付けは保持される。
  convertToSet: (id: number, data: {
    category_id: number
    name: string
    description: string
    pieces: EquipmentSetPieceInput[]
  }): Promise<{ data: Item }> => {
    if (USE_MOCK) {
      const allCategories = mockCategories.flatMap((c) => [c, ...(c.children ?? [])])
      const category = allCategories.find((c) => c.id === data.category_id)!
      const set: Item = {
        id: Date.now(),
        category,
        name: data.name,
        description: data.description,
        image_url: null,
        base_stats: {},
        special_conditions: [],
        dyeable: null,
        mithril: false,
        is_equipment_set: true,
        set_piece_category_ids: data.pieces.map((p) => p.category_id),
        set_members: [],
        skill_requirements: null,
        mastery_requirements: null,
        placement: null,
        asset_width: null,
        asset_height: null,
        storage_count: null,
        special_function: null,
        verified_status: 'unverified',
        submitted_by: 99,
        locked_by_staff: false,
        bonus_effects: [],
      }
      mockItems.push(set)
      return Promise.resolve({ data: set })
    }
    return client.post<Item>(`/items/${id}/convert-to-set`, data)
  },

  verify: (id: number): Promise<{ data: Item }> => {
    if (USE_MOCK) {
      const item = mockItems.find((i) => i.id === id)!
      item.verified_status = 'verified'
      return Promise.resolve({ data: { ...item } })
    }
    return client.post(`/items/${id}/verify`)
  },

  // 確認済みアイテムを確認中（unverified）に戻す（editor / admin）
  unverify: (id: number): Promise<{ data: Item }> => {
    if (USE_MOCK) {
      const item = mockItems.find((i) => i.id === id)!
      item.verified_status = 'unverified'
      return Promise.resolve({ data: { ...item } })
    }
    return client.post(`/items/${id}/unverify`)
  },

  // ユーザー追加ハッシュタグ（wiki型・ログイン必須）。先頭の # はサーバー側で除去される。
  addHashtag: (itemId: number, tag: string): Promise<{ data: ItemHashtag }> => {
    if (USE_MOCK) {
      return Promise.resolve({ data: { id: Date.now(), tag: tag.replace(/^[#＃]+/, '').trim(), is_fixed: false } })
    }
    return client.post<ItemHashtag>(`/items/${itemId}/hashtags`, { tag }).then((r) => ({ data: r.data }))
  },

  // ユーザー追加ハッシュタグの削除（固定タグは削除不可）。
  removeHashtag: (itemId: number, hashtagId: number): Promise<void> => {
    if (USE_MOCK) return Promise.resolve()
    return client.delete(`/items/${itemId}/hashtags/${hashtagId}`)
  },

  // ユーザー追加ハッシュタグをテキスト入力で総入れ替えする（wiki型・固定タグは保持）。
  // 戻り値は入れ替え後の全ハッシュタグ（固定＋通常）。
  replaceHashtags: (itemId: number, tags: string[]): Promise<{ data: ItemHashtag[] }> => {
    if (USE_MOCK) {
      return Promise.resolve({
        data: tags.map((tag, i) => ({ id: Date.now() + i, tag, is_fixed: false })),
      })
    }
    return client.put<ItemHashtag[]>(`/items/${itemId}/hashtags`, { tags }).then((r) => ({ data: r.data }))
  },

  // force=true で関連データ（出品・取引チャット・取引履歴）ごと削除する
  delete: (id: number, force = false): Promise<void> => {
    if (USE_MOCK) {
      const idx = mockItems.findIndex((i) => i.id === id)
      if (idx !== -1) mockItems.splice(idx, 1)
      return Promise.resolve()
    }
    return client.delete(`/items/${id}`, force ? { params: { force: 1 } } : undefined)
  },

  // 重複アイテムの統合（admin）。sourceId の出品・取引履歴・相場を targetId へ付け替え、source を削除する。
  merge: (
    sourceId: number,
    targetId: number,
  ): Promise<{ data: { merged_into: { id: number; name: string }; listing_count: number; buy_request_count: number; history_count: number; market_count: number } }> => {
    if (USE_MOCK) {
      const idx = mockItems.findIndex((i) => i.id === sourceId)
      if (idx !== -1) mockItems.splice(idx, 1)
      const t = mockItems.find((i) => i.id === targetId)
      return Promise.resolve({ data: { merged_into: { id: targetId, name: t?.name ?? '' }, listing_count: 0, buy_request_count: 0, history_count: 0, market_count: 0 } })
    }
    return client.post(`/items/${sourceId}/merge`, { target_id: targetId }).then((r) => ({ data: r.data }))
  },

  priceHistory: (id: number) =>
    client.get<PriceHistory[]>(`/items/${id}/price-history`),

  priceAnalytics: (id: number): Promise<{ data: ItemPriceAnalytics }> => {
    if (USE_MOCK) {
      const data = mockPriceAnalytics[id] ?? {
        item_id: id, stats: { min: 0, max: 0, avg: 0, median: 0, deal_count: 0, listing_count: 0 },
        history: [], recent_deals: [], recent_listings: [],
      }
      return Promise.resolve({ data })
    }
    return client.get<ItemPriceAnalytics>(`/items/${id}/price-analytics`)
  },

  // 他サイト等で取引された相場情報を手動登録する（editor / admin）
  createMarketPrice: (
    itemId: number,
    data: { price: number; server: string; traded_at: string; currency?: string; note?: string }
  ): Promise<void> => {
    if (USE_MOCK) return Promise.resolve()
    return client.post(`/items/${itemId}/market-prices`, data)
  },

  categories: (): Promise<{ data: ItemCategory[] }> => {
    if (USE_MOCK) return Promise.resolve({ data: mockCategories })
    return client.get<ItemCategory[]>('/categories')
  },

  bonusEffectTypes: (): Promise<{ data: BonusEffectType[] }> => {
    if (USE_MOCK) return Promise.resolve({ data: mockBonusTypes })
    return client.get<BonusEffectType[]>('/bonus-effect-types')
  },
}
