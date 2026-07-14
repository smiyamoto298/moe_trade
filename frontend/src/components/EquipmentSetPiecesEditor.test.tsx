import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EquipmentSetPiecesEditor, { type EquipmentSetForm, formToPieces, membersToForm } from './EquipmentSetPiecesEditor'
import type { Item, ItemCategory } from '../types'

// design.md「装備セット」: 構成部位の名前入力欄は、追加した順ではなく
// 構成部位チェックボックス（カテゴリ）の並び順で表示する。
// テクニック（ノアピース・秘伝の書）も部位として選択できるが、効果設定の対象外。

const categories: ItemCategory[] = [
  {
    id: 1, parent_id: null, name: '防具', sort_order: 1,
    children: [
      { id: 11, parent_id: 1, name: '頭(防)', sort_order: 1 },
      { id: 12, parent_id: 1, name: '胴(防)', sort_order: 2 },
      { id: 13, parent_id: 1, name: '脚(防)', sort_order: 3 },
    ],
  },
  {
    id: 2, parent_id: null, name: 'その他', sort_order: 2,
    children: [
      { id: 21, parent_id: 2, name: '未開封ペット', sort_order: 1 },
      { id: 22, parent_id: 2, name: 'レシピ', sort_order: 2 },
    ],
  },
  {
    id: 3, parent_id: null, name: 'テクニック', sort_order: 3,
    children: [
      { id: 31, parent_id: 3, name: 'ノアピース', sort_order: 1 },
      { id: 32, parent_id: 3, name: '秘伝の書', sort_order: 2 },
    ],
  },
]

const TECHNIQUE_IDS = new Set([3, 31, 32])

const makeForm = (parts: EquipmentSetForm['parts']): EquipmentSetForm => ({
  parts,
  baseStatsGroups: [{ partCategoryIds: [], base_stats: {}, custom_stats: [], special_conditions: [] }],
  bonusGroups: [{ partCategoryIds: [], bonus_effects: [] }],
})

// 部位フォームのファクトリ（省略項目は既定値で補う）
const part = (
  over: Partial<EquipmentSetForm['parts'][number]> & { category_id: number },
): EquipmentSetForm['parts'][number] => ({
  name: '', mithril: false, dyeable: false, official_url: '',
  skill_requirements: {}, mastery_requirements: [],
  ...over,
})

describe('EquipmentSetPiecesEditor 構成部位の名前入力欄の並び順', () => {
  it('追加順に関係なくカテゴリ（チェックボックス）の並び順で表示する', () => {
    // 脚(13) → 頭(11) の順で追加された parts でも、表示はカテゴリ順（頭→脚）になる
    const value = makeForm([
      part({ category_id: 13, name: '脚装備' }),
      part({ category_id: 11, name: '頭装備' }),
    ])
    render(
      <EquipmentSetPiecesEditor
        categories={categories}
        value={value}
        onChange={() => {}}
        bonusValueLabelOptions={[]}
        statLabelOptions={[]}
      />
    )

    const names = screen.getAllByPlaceholderText('部位アイテム名').map((el) => (el as HTMLInputElement).value)
    expect(names).toEqual(['頭装備', '脚装備'])
  })

  it('部位ごとに公式DBの入力欄を表示し、値をカテゴリ順で並べる', () => {
    const value = makeForm([
      part({ category_id: 13, name: '脚装備', official_url: 'http://moepic.com/leg' }),
      part({ category_id: 11, name: '頭装備', official_url: 'http://moepic.com/head' }),
    ])
    render(
      <EquipmentSetPiecesEditor
        categories={categories}
        value={value}
        onChange={() => {}}
        bonusValueLabelOptions={[]}
        statLabelOptions={[]}
      />
    )

    const urls = screen
      .getAllByPlaceholderText(/moepic\.com/)
      .map((el) => (el as HTMLInputElement).value)
    // カテゴリ順（頭→脚）で並ぶ
    expect(urls).toEqual(['http://moepic.com/head', 'http://moepic.com/leg'])
  })
})

describe('EquipmentSetPiecesEditor 構成部位カテゴリの候補', () => {
  it('最上位カテゴリ「その他」（未開封ペット・レシピ）は部位候補に表示しない', () => {
    render(
      <EquipmentSetPiecesEditor
        categories={categories}
        value={makeForm([])}
        onChange={() => {}}
        bonusValueLabelOptions={[]}
        statLabelOptions={[]}
      />
    )

    // 装備部位カテゴリは表示される
    expect(screen.getByText('防具')).toBeInTheDocument()
    expect(screen.getByText('頭(防)')).toBeInTheDocument()
    // 「その他」グループの子カテゴリは部位候補に表示されない
    // （「その他」の文字列自体は追加効果の自由入力セクション見出しにも使われるため、子カテゴリで判定する）
    expect(screen.queryByText('未開封ペット')).not.toBeInTheDocument()
    expect(screen.queryByText('レシピ')).not.toBeInTheDocument()
  })

  it('テクニック（ノアピース・秘伝の書）を部位候補に表示する', () => {
    render(
      <EquipmentSetPiecesEditor
        categories={categories}
        value={makeForm([])}
        onChange={() => {}}
        bonusValueLabelOptions={[]}
        statLabelOptions={[]}
      />
    )

    expect(screen.getByText('テクニック')).toBeInTheDocument()
    expect(screen.getByText('ノアピース')).toBeInTheDocument()
    expect(screen.getByText('秘伝の書')).toBeInTheDocument()
  })
})

describe('EquipmentSetPiecesEditor テクニック部位', () => {
  it('テクニック部位にはミスリル・染色可のチェックを表示しない', () => {
    const value = makeForm([
      part({ category_id: 11, name: '頭装備' }),
      part({ category_id: 31, name: 'ノアピース：ヴィガー' }),
    ])
    render(
      <EquipmentSetPiecesEditor
        categories={categories}
        value={value}
        onChange={() => {}}
        bonusValueLabelOptions={[]}
        statLabelOptions={[]}
      />
    )

    // 装備部位（頭）の1部位分だけミスリル・染色可が表示される
    expect(screen.getAllByText('ミスリル')).toHaveLength(1)
    expect(screen.getAllByText('染色可')).toHaveLength(1)
    // テクニック部位には効果設定対象外の注記を表示する
    expect(screen.getByText('テクニック（効果設定なし）')).toBeInTheDocument()
    // 名前入力欄はテクニック部位にもある
    const names = screen.getAllByPlaceholderText('部位アイテム名').map((el) => (el as HTMLInputElement).value)
    expect(names).toContain('ノアピース：ヴィガー')
    // テクニック部位の1部位分だけ必要スキル・マスタリの入力セクションを表示する
    expect(screen.getAllByText('必要スキル・マスタリ')).toHaveLength(1)
  })

  it('formToPieces はテクニック部位の効果を空にし、必要スキル・マスタリを数値化して送る', () => {
    const form: EquipmentSetForm = {
      parts: [
        part({ category_id: 11, name: '頭装備', mithril: true, dyeable: true }),
        part({
          category_id: 32, name: '秘伝の書：奥義', official_url: 'http://moepic.com/book',
          // 空文字のスキルは送らない。マスタリはコードの配列
          skill_requirements: { 刀剣: '80', こんぼう: '' },
          mastery_requirements: ['WAR'],
        }),
      ],
      baseStatsGroups: [{
        partCategoryIds: [],
        base_stats: { atk: '10' },
        custom_stats: [],
        special_conditions: ['NT'],
      }],
      bonusGroups: [{
        partCategoryIds: [],
        bonus_effects: [{
          effect_name: '炎纏い',
          values: [{ value: '5', value_unit: '%', label: '火力' }],
          description: '', is_exclusive: false, no_warage_effect: false,
        }],
      }],
    }

    const pieces = formToPieces(form, TECHNIQUE_IDS)
    const head = pieces.find((p) => p.category_id === 11)!
    const book = pieces.find((p) => p.category_id === 32)!

    // 装備部位は全部位共通グループの設定を受け取る（保存時に数値化される）
    expect(head.base_stats).toEqual({ atk: 10 })
    expect(head.special_conditions).toEqual(['NT'])
    expect(head.mithril).toBe(true)
    expect(head.bonus_effects).toHaveLength(1)
    // 装備部位は必要スキル・マスタリを持たない（null で既存値もクリア）
    expect(head.skill_requirements).toBeNull()
    expect(head.mastery_requirements).toBeNull()
    // テクニック部位は効果を持たない（全部位共通グループの設定を適用しない）
    expect(book.base_stats).toEqual({})
    expect(book.special_conditions).toEqual([])
    expect(book.mithril).toBe(false)
    expect(book.dyeable).toBe(false)
    expect(book.bonus_effects).toEqual([])
    // 必要スキルは空文字を除いて数値化し、マスタリはコード配列のまま送る
    expect(book.skill_requirements).toEqual({ 刀剣: 80 })
    expect(book.mastery_requirements).toEqual(['WAR'])
    // 名前・公式DBは他部位と同様に送る
    expect(book.name).toBe('秘伝の書：奥義')
    expect(book.official_url).toBe('http://moepic.com/book')
  })

  it('membersToForm はテクニック部位を効果グループの構築から除外する', () => {
    const makeMember = (over: Partial<Item>): Item => ({
      id: 1, name: '', description: null, official_url: null,
      base_stats: {}, special_conditions: [], dyeable: false, mithril: false,
      bonus_effects: [], is_equipment_set: false,
      skill_requirements: null, mastery_requirements: null,
      category: { id: 11, parent_id: 1, name: '頭(防)', sort_order: 1 },
      ...over,
    } as Item)
    const members: Item[] = [
      makeMember({ id: 1, name: '頭装備', base_stats: { atk: 10 } }),
      makeMember({ id: 2, name: '胴装備', base_stats: { atk: 10 }, category: { id: 12, parent_id: 1, name: '胴(防)', sort_order: 2 } }),
      // テクニック部位（効果なし・必要スキル/マスタリあり）。グループ構築から除外され、余計な設定グループを作らない
      makeMember({
        id: 3, name: 'ノアピース：ヴィガー',
        category: { id: 31, parent_id: 3, name: 'ノアピース', sort_order: 1 },
        skill_requirements: { 刀剣: 80 }, mastery_requirements: ['WAR'],
      }),
    ]

    const form = membersToForm(members, TECHNIQUE_IDS)

    // 部位リストにはテクニックも含まれる
    expect(form.parts.map((p) => p.category_id)).toEqual([11, 12, 31])
    // 効果グループは装備部位（同一設定）の1グループのみ（テクニック用の空グループを作らない）
    expect(form.baseStatsGroups).toHaveLength(1)
    expect(form.bonusGroups).toHaveLength(1)
    expect(form.baseStatsGroups[0].base_stats).toEqual({ atk: '10' })
    // テクニック部位の必要スキル・マスタリは部位フォームへ復元される（値は文字列化）
    const noah = form.parts.find((p) => p.category_id === 31)!
    expect(noah.skill_requirements).toEqual({ 刀剣: '80' })
    expect(noah.mastery_requirements).toEqual(['WAR'])
  })
})
