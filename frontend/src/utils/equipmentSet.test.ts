import { describe, it, expect } from 'vitest'
import type { Item, ItemBonusEffect } from '../types'
import {
  groupPiecesByBaseStats,
  groupPiecesByBonusEffects,
  groupPiecesByPerformance,
  hasBaseStats,
  hasBonusEffects,
} from './equipmentSet'

// design.md「装備セット」:
// 一覧・詳細では、性能（追加効果・付加効果・特殊条件・ミスリル）が同一の部位を
// 1グループにまとめ、設定が異なる部位は別グループとして両方表示する。

let nextId = 1
const piece = (partName: string, over: Partial<Item> = {}): Item => ({
  id: nextId++,
  category: { id: 100, parent_id: 2, name: partName, sort_order: 0 },
  name: `${partName}の部位`,
  description: '',
  image_url: null,
  base_stats: {},
  special_conditions: [],
  dyeable: null,
  mithril: false,
  is_equipment_set: false,
  set_piece_category_ids: null,
  skill_requirements: null,
  mastery_requirements: null,
  verified_status: 'verified',
  submitted_by: null,
  locked_by_staff: false,
  bonus_effects: [],
  ...over,
})

const bonus = (name: string, value: number): ItemBonusEffect => ({
  id: nextId++, // id は比較対象外（グルーピングはキー内容のみで判定）
  effect_name: name,
  type: { id: 1, type_key: 'attack_up', label: '攻撃強化', category: 'attack' },
  values: [{ value, value_unit: '%', label: '物理ダメージ' }],
  description: '',
})

describe('groupPiecesByBaseStats', () => {
  it('base_stats が同一の部位を1グループにまとめ、部位名を出現順に並べる', () => {
    const members = [
      piece('頭', { base_stats: { def: 10, max_hp: 5 } }),
      piece('胴', { base_stats: { def: 10, max_hp: 5 } }),
      piece('手', { base_stats: { def: 3 } }),
    ]
    const groups = groupPiecesByBaseStats(members)
    expect(groups).toHaveLength(2)
    expect(groups[0].partNames).toEqual(['頭', '胴'])
    expect(groups[1].partNames).toEqual(['手'])
  })

  it('キーの順序が違っても同一の base_stats とみなす（順序非依存）', () => {
    const a = piece('頭', { base_stats: { def: 10, max_hp: 5 } })
    const b = piece('胴', { base_stats: { max_hp: 5, def: 10 } })
    expect(groupPiecesByBaseStats([a, b])).toHaveLength(1)
  })

  it('ミスリルフラグが異なる部位は別グループになる', () => {
    const a = piece('頭', { base_stats: { def: 10 }, mithril: true })
    const b = piece('胴', { base_stats: { def: 10 }, mithril: false })
    expect(groupPiecesByBaseStats([a, b])).toHaveLength(2)
  })
})

describe('groupPiecesByBonusEffects', () => {
  it('付加効果の内容が同一なら id が違っても同一グループ', () => {
    const a = piece('頭', { bonus_effects: [bonus('剛剣の使い手', 15)] })
    const b = piece('胴', { bonus_effects: [bonus('剛剣の使い手', 15)] })
    expect(groupPiecesByBonusEffects([a, b])).toHaveLength(1)
  })

  it('数値が異なる付加効果は別グループ', () => {
    const a = piece('頭', { bonus_effects: [bonus('剛剣の使い手', 15)] })
    const b = piece('胴', { bonus_effects: [bonus('剛剣の使い手', 10)] })
    expect(groupPiecesByBonusEffects([a, b])).toHaveLength(2)
  })
})

describe('groupPiecesByPerformance', () => {
  it('追加効果・付加効果・特殊条件がすべて同一の部位のみ1グループにまとめる', () => {
    const same1 = piece('頭', {
      base_stats: { def: 10 },
      bonus_effects: [bonus('守りの加護', 5)],
      special_conditions: ['NT', 'ND'],
    })
    const same2 = piece('胴', {
      base_stats: { def: 10 },
      bonus_effects: [bonus('守りの加護', 5)],
      special_conditions: ['ND', 'NT'], // 特殊条件は順序非依存
    })
    const diff = piece('手', {
      base_stats: { def: 10 },
      bonus_effects: [bonus('守りの加護', 5)],
      special_conditions: ['NT'],
    })
    const groups = groupPiecesByPerformance([same1, same2, diff])
    expect(groups).toHaveLength(2)
    expect(groups[0].partNames).toEqual(['頭', '胴'])
    expect(groups[0].members.map((m) => m.name)).toEqual(['頭の部位', '胴の部位'])
    expect(groups[1].partNames).toEqual(['手'])
  })
})

describe('hasBaseStats / hasBonusEffects', () => {
  it('base_stats が空でもミスリルなら「追加効果あり」', () => {
    expect(hasBaseStats(piece('頭'))).toBe(false)
    expect(hasBaseStats(piece('頭', { mithril: true }))).toBe(true)
    expect(hasBaseStats(piece('頭', { base_stats: { atk: 1 } }))).toBe(true)
  })

  it('付加効果の有無を判定する', () => {
    expect(hasBonusEffects(piece('頭'))).toBe(false)
    expect(hasBonusEffects(piece('頭', { bonus_effects: [bonus('x', 1)] }))).toBe(true)
  })
})
