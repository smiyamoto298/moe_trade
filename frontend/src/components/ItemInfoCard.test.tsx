import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Item } from '../types'
import ItemInfoCard from './ItemInfoCard'

// design.md「必要マスタリ（スキル種別）」:
// テクニックは効果ではなく必要スキル値・必要マスタリ（複数は OR）を持つ。
// アイテム情報カード（出品詳細／買取詳細／アイテム恒久ページ /items/:id ／アイテム詳細モーダル共通）は
// テクニックのこの2項目を表示する。必要スキル値を持つレシピはレシピ情報側で表示するため対象外。

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: 1,
  category: { id: 21, parent_id: 2, name: '秘伝の書', sort_order: 1 },
  name: 'ダブルアタック',
  description: '',
  image_url: null,
  official_url: null,
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

describe('ItemInfoCard（テクニック）', () => {
  it('必要スキル値をスキル名と値で表示する', () => {
    render(<ItemInfoCard item={makeItem({ skill_requirements: { 刀剣: 40, 戦闘技術: 25 } })} />)

    expect(screen.getByText('テクニック情報')).toBeInTheDocument()
    expect(screen.getByText('必要スキル値')).toBeInTheDocument()
    expect(screen.getByText(/刀剣:/)).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText(/戦闘技術:/)).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('必要マスタリをマスタリ名【コード】と構成スキルで表示する', () => {
    render(<ItemInfoCard item={makeItem({ mastery_requirements: ['WAR'] })} />)

    expect(screen.getByText('必要マスタリ')).toBeInTheDocument()
    expect(screen.getByText('ウォーリアー【WAR】')).toBeInTheDocument()
    // 構成スキル（全て40で発動）も併記する
    for (const skill of ['刀剣', 'キック', '盾', '戦闘技術']) {
      expect(screen.getByText(skill)).toBeInTheDocument()
    }
    // 単一マスタリでは OR の注記を出さない
    expect(screen.queryByText('いずれかで発動（OR）')).not.toBeInTheDocument()
  })

  it('必要マスタリが複数のときは OR 条件であることを示す', () => {
    render(<ItemInfoCard item={makeItem({ mastery_requirements: ['WAR', 'SAM'] })} />)

    expect(screen.getByText('いずれかで発動（OR）')).toBeInTheDocument()
    expect(screen.getByText('ウォーリアー【WAR】')).toBeInTheDocument()
    expect(screen.getByText('サムライ【SAM】')).toBeInTheDocument()
  })

  it('必要スキル値・必要マスタリを持たないアイテムではテクニック情報を表示しない', () => {
    render(<ItemInfoCard item={makeItem({ category: { id: 11, parent_id: 3, name: '刀剣', sort_order: 1 }, base_stats: { atk: 10 } })} />)

    expect(screen.queryByText('テクニック情報')).not.toBeInTheDocument()
  })

  it('レシピの必要スキル値はレシピ情報側で表示し、テクニック情報は出さない', () => {
    render(
      <ItemInfoCard
        item={makeItem({
          category: { id: 41, parent_id: 4, name: 'レシピ', sort_order: 1 },
          name: '鉄の剣のレシピ',
          skill_requirements: { 鍛冶: 30 },
          recipe_entries: [{ name: '鉄の剣', skill_requirements: { 鍛冶: 30 } }],
        })}
      />
    )

    expect(screen.queryByText('テクニック情報')).not.toBeInTheDocument()
    expect(screen.getByText('レシピ情報')).toBeInTheDocument()
    expect(screen.getByText(/鍛冶:/)).toBeInTheDocument()
  })

  it('アイテムセットは set_items を「アイテムリスト」として表示する', () => {
    render(
      <ItemInfoCard
        item={makeItem({
          category: { id: 44, parent_id: 4, name: 'アイテムセット', sort_order: 3 },
          name: '初心者応援セット',
          set_items: ['銅の剣', '回復ポーション'],
        })}
      />
    )

    expect(screen.getByText('アイテムセット情報')).toBeInTheDocument()
    expect(screen.getByText('アイテムリスト')).toBeInTheDocument()
    expect(screen.getByText('銅の剣')).toBeInTheDocument()
    expect(screen.getByText('回復ポーション')).toBeInTheDocument()
  })

  it('選べるチケットは set_items を「選べるアイテム」として表示する', () => {
    render(
      <ItemInfoCard
        item={makeItem({
          category: { id: 45, parent_id: 4, name: '選べるチケット', sort_order: 4 },
          name: '選べる武器チケット',
          set_items: ['銅の剣', '鉄の槍'],
        })}
      />
    )

    expect(screen.getByText('選べるチケット情報')).toBeInTheDocument()
    expect(screen.getByText('選べるアイテム')).toBeInTheDocument()
    expect(screen.queryByText('アイテムリスト')).not.toBeInTheDocument()
    expect(screen.getByText('銅の剣')).toBeInTheDocument()
    expect(screen.getByText('鉄の槍')).toBeInTheDocument()
  })
})
