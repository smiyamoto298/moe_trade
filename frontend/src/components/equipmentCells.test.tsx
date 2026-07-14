import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Item, ItemBonusEffect, ItemCategory, RecipeEntry } from '../types'
import { BonusEffectList, OtherInfoCell, SetBaseStatsCell, SetBonusCell, SetSpecialConditionsCell } from './equipmentCells'

// 付加効果のテキスト値が長い（5文字以上）場合、一覧では [詳細] にしてホバーで全文を出す。
// 単位付き数値や4文字以下のテキストはそのまま表示する。

function itemWithEffects(effects: Partial<ItemBonusEffect>[]): Item {
  return {
    bonus_effects: effects.map((e, i) => ({
      id: i + 1,
      effect_name: e.effect_name ?? '効果',
      is_exclusive: e.is_exclusive ?? false,
      values: e.values ?? [],
    })),
  } as unknown as Item
}

describe('BonusEffectList', () => {
  it('5文字以上のテキスト値は「詳細」バッジで表示し、全文をポップアップに含める', () => {
    const item = itemWithEffects([
      { effect_name: '特殊効果', values: [{ value: '長い説明テキストです', value_unit: 'text' }] },
    ])
    render(<BonusEffectList item={item} />)

    expect(screen.getByText('詳細')).toBeInTheDocument()
    // ポップアップに全文が含まれる
    expect(screen.getByText('長い説明テキストです')).toBeInTheDocument()
  })

  it('4文字以下のテキスト値はそのまま表示し「詳細」バッジにしない', () => {
    const item = itemWithEffects([
      { effect_name: '効果', values: [{ value: '短文', value_unit: 'text' }] },
    ])
    render(<BonusEffectList item={item} />)

    expect(screen.getByText('短文')).toBeInTheDocument()
    expect(screen.queryByText('詳細')).not.toBeInTheDocument()
  })

  it('数値＋単位は文字数に関わらずそのまま表示する', () => {
    const item = itemWithEffects([
      { effect_name: '剛剣の使い手', values: [{ value: 15, value_unit: '%', label: '物理ダメージ' }] },
    ])
    render(<BonusEffectList item={item} />)

    expect(screen.getByText('+15%')).toBeInTheDocument()
    expect(screen.queryByText('詳細')).not.toBeInTheDocument()
  })
})

function itemWithRecipeEntries(entries: RecipeEntry[] | null, extra: Partial<Item> = {}): Item {
  return { recipe_entries: entries, ...extra } as unknown as Item
}

describe('OtherInfoCell', () => {
  it('recipe_entries を複数エントリ分（レシピ名/必要スキル値）表示する', () => {
    const item = itemWithRecipeEntries([
      { name: '上級ポーション', skill_requirements: { 薬調合: 70 } },
      { name: 'パン', skill_requirements: { 料理: 40 } },
    ])
    render(<OtherInfoCell item={item} />)

    expect(screen.getByText('上級ポーション')).toBeInTheDocument()
    expect(screen.getByText('パン')).toBeInTheDocument()
    // 各エントリ固有のスキルが出る
    expect(screen.getByText('薬調合:')).toBeInTheDocument()
    expect(screen.getByText('料理:')).toBeInTheDocument()
    expect(screen.getByText('70')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
  })

  it('recipe_entries が無い旧データは recipe_name/skill_requirements から表示する', () => {
    const item = itemWithRecipeEntries(null, {
      recipe_name: '鉄の剣',
      skill_requirements: { 鍛冶: 60 },
    })
    render(<OtherInfoCell item={item} />)

    expect(screen.getByText('鉄の剣')).toBeInTheDocument()
    expect(screen.getByText('鍛冶:')).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument()
  })

  it('レシピ情報もペット名も無ければダッシュを表示する', () => {
    render(<OtherInfoCell item={itemWithRecipeEntries(null)} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

// design.md「装備セット」: 出品一覧の付加効果列では、テクニック部位（ノアピース・秘伝の書）は
// 付加効果を持たないため、効果グループに含めず部位カテゴリ名チップ＋アイテム名を表示する。

const setCategories: ItemCategory[] = [
  {
    id: 1, parent_id: null, name: '防具', sort_order: 1,
    children: [{ id: 11, parent_id: 1, name: '頭(防)', sort_order: 1 }],
  },
  {
    id: 3, parent_id: null, name: 'テクニック', sort_order: 2,
    children: [{ id: 31, parent_id: 3, name: 'ノアピース', sort_order: 1 }],
  },
]

function setMember(over: Partial<Item>): Item {
  return {
    id: 1, name: '', base_stats: {}, special_conditions: [], mithril: false,
    bonus_effects: [],
    category: { id: 11, parent_id: 1, name: '頭(防)', sort_order: 1 },
    ...over,
  } as unknown as Item
}

describe('SetBonusCell テクニック部位の表示', () => {
  it('テクニック部位は効果グループに含めず、部位カテゴリ名チップとアイテム名を表示する', () => {
    const members = [
      setMember({
        id: 1, name: '頭装備',
        bonus_effects: [{ id: 1, effect_name: '炎纏い', is_exclusive: false, values: [], description: '' } as unknown as ItemBonusEffect],
      }),
      setMember({
        id: 2, name: 'ノアピース：ヴィガー',
        category: { id: 31, parent_id: 3, name: 'ノアピース', sort_order: 1 },
      }),
    ]
    render(<SetBonusCell members={members} categories={setCategories} />)

    // 装備部位の付加効果は従来どおり表示される
    expect(screen.getByText('炎纏い')).toBeInTheDocument()
    // テクニック部位は部位カテゴリ名チップ＋アイテム名で表示される
    expect(screen.getByText('ノアピース')).toBeInTheDocument()
    expect(screen.getByText('ノアピース：ヴィガー')).toBeInTheDocument()
    // 効果なしのダッシュ（テクニック部位を効果グループとして表示しない）
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('showTechniqueNames=false ならテクニック部位の名前を表示しない（「すべて」タブで別枠表示する用）', () => {
    const members = [
      setMember({
        id: 1, name: '頭装備',
        bonus_effects: [{ id: 1, effect_name: '炎纏い', is_exclusive: false, values: [], description: '' } as unknown as ItemBonusEffect],
      }),
      setMember({
        id: 2, name: 'ノアピース：ヴィガー',
        category: { id: 31, parent_id: 3, name: 'ノアピース', sort_order: 1 },
      }),
    ]
    render(<SetBonusCell members={members} categories={setCategories} showTechniqueNames={false} />)

    // 装備部位の付加効果のみ表示し、テクニック部位の名前は出さない
    expect(screen.getByText('炎纏い')).toBeInTheDocument()
    expect(screen.queryByText('ノアピース：ヴィガー')).not.toBeInTheDocument()
    expect(screen.queryByText('ノアピース')).not.toBeInTheDocument()
  })

  it('categories 未指定なら従来どおり全部位を効果でグループ化する（アイテム名は表示しない）', () => {
    const members = [
      setMember({ id: 1, name: '頭装備' }),
      setMember({
        id: 2, name: 'ノアピース：ヴィガー',
        category: { id: 31, parent_id: 3, name: 'ノアピース', sort_order: 1 },
      }),
    ]
    render(<SetBonusCell members={members} />)

    // 全部位が効果なしの1グループ → ダッシュのみ
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('ノアピース：ヴィガー')).not.toBeInTheDocument()
  })
})

// design.md「装備セット」: テクニックは追加効果・特殊条件も持たないため、
// 追加効果列・特殊条件列のグループ化対象から外す（「ノアピース: —」のような空グループを出さない）。

describe('SetBaseStatsCell / SetSpecialConditionsCell テクニック部位の除外', () => {
  const members = [
    setMember({ id: 1, name: '頭装備', base_stats: { atk: 10 }, special_conditions: ['NT'] }),
    setMember({
      id: 2, name: 'ノアピース：ヴィガー',
      category: { id: 31, parent_id: 3, name: 'ノアピース', sort_order: 1 },
    }),
  ]

  it('追加効果列はテクニック部位をグループ化対象から外す（空グループの部位チップを出さない）', () => {
    render(<SetBaseStatsCell members={members} categories={setCategories} />)

    // 装備部位の追加効果は表示される（1グループなので部位チップなしのフラット表示）
    expect(screen.getByText(/攻撃力/)).toBeInTheDocument()
    // テクニック部位の空グループ（ノアピースチップ＋ダッシュ）を出さない
    expect(screen.queryByText('ノアピース')).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('特殊条件列はテクニック部位をグループ化対象から外す', () => {
    render(<SetSpecialConditionsCell members={members} categories={setCategories} />)

    expect(screen.getByText('NT')).toBeInTheDocument()
    expect(screen.queryByText('ノアピース')).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('テクニック部位しか無いセットの追加効果・特殊条件列はダッシュを表示する', () => {
    const onlyTech = [members[1]]
    const { unmount } = render(<SetBaseStatsCell members={onlyTech} categories={setCategories} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    unmount()
    render(<SetSpecialConditionsCell members={onlyTech} categories={setCategories} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
