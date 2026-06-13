import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EquipmentSetPiecesEditor, { type EquipmentSetForm } from './EquipmentSetPiecesEditor'
import type { ItemCategory } from '../types'

// design.md「装備セット」: 構成部位の名前入力欄は、追加した順ではなく
// 構成部位チェックボックス（カテゴリ）の並び順で表示する。

const categories: ItemCategory[] = [
  {
    id: 1, parent_id: null, name: '防具', sort_order: 1,
    children: [
      { id: 11, parent_id: 1, name: '頭(防)', sort_order: 1 },
      { id: 12, parent_id: 1, name: '胴(防)', sort_order: 2 },
      { id: 13, parent_id: 1, name: '脚(防)', sort_order: 3 },
    ],
  },
]

const makeForm = (parts: EquipmentSetForm['parts']): EquipmentSetForm => ({
  parts,
  baseStatsGroups: [{ partCategoryIds: [], base_stats: {}, special_conditions: [] }],
  bonusGroups: [{ partCategoryIds: [], bonus_effects: [] }],
})

describe('EquipmentSetPiecesEditor 構成部位の名前入力欄の並び順', () => {
  it('追加順に関係なくカテゴリ（チェックボックス）の並び順で表示する', () => {
    // 脚(13) → 頭(11) の順で追加された parts でも、表示はカテゴリ順（頭→脚）になる
    const value = makeForm([
      { category_id: 13, name: '脚装備', mithril: false, dyeable: false },
      { category_id: 11, name: '頭装備', mithril: false, dyeable: false },
    ])
    render(
      <EquipmentSetPiecesEditor
        categories={categories}
        value={value}
        onChange={() => {}}
        bonusValueLabelOptions={[]}
      />
    )

    const names = screen.getAllByPlaceholderText('部位アイテム名').map((el) => (el as HTMLInputElement).value)
    expect(names).toEqual(['頭装備', '脚装備'])
  })
})
