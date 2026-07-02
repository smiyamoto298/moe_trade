import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Item, ItemBonusEffect, RecipeEntry } from '../types'
import { BonusEffectList, OtherInfoCell } from './equipmentCells'

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
