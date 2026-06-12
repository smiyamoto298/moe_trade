import { describe, it, expect } from 'vitest'
import {
  ALL_SKILLS,
  SKILL_GROUPS,
  MASTERIES,
  MASTERY_BY_CODE,
  SPECIAL_CONDITIONS,
  BASE_STAT_LABELS,
  ASSET_PLACEMENTS,
  ASSET_FUNCTIONS,
} from './constants'

// design.md のマスタ定義（追加効果キー・特殊条件・スキル・マスタリ・アセット選択肢）と
// フロント定数の整合を回帰テストとして固定する。

describe('SKILL_GROUPS / ALL_SKILLS', () => {
  it('design.md のグループ構成（戦闘・基本・生産・熟練）と一致する', () => {
    expect(SKILL_GROUPS.map((g) => g.group)).toEqual(['戦闘', '基本', '生産', '熟練'])
  })

  it('スキル名に重複が無い', () => {
    expect(new Set(ALL_SKILLS).size).toBe(ALL_SKILLS.length)
  })
})

describe('MASTERIES', () => {
  // design.md「必要マスタリ」: 構成スキル名は SKILL_GROUPS と完全一致させる
  // （テクニック絞り込みがスキル名で突き合わせるため、表記ゆれは絞り込み漏れになる）
  it('全マスタリの構成スキルが SKILL_GROUPS に存在する', () => {
    const known = new Set(ALL_SKILLS)
    for (const m of MASTERIES) {
      const unknown = m.skills.filter((s) => !known.has(s))
      expect(unknown, `${m.code}(${m.name}) の未知スキル`).toEqual([])
    }
  })

  it('コードが一意で、MASTERY_BY_CODE から引ける', () => {
    const codes = MASTERIES.map((m) => m.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(MASTERY_BY_CODE['WAR']?.name).toBe('ウォーリアー')
  })
})

describe('SPECIAL_CONDITIONS', () => {
  it('design.md の特殊条件 15 種と一致する', () => {
    expect(Object.keys(SPECIAL_CONDITIONS).sort()).toEqual(
      ['NT', 'OP', 'CS', 'CR', 'PM', 'NC', 'NB', 'ND', 'CA', 'DL', 'TC', 'LO', 'AL', 'WA', 'DA'].sort()
    )
  })
})

describe('BASE_STAT_LABELS', () => {
  it('design.md の追加効果キー 17 種と一致する', () => {
    expect(Object.keys(BASE_STAT_LABELS).sort()).toEqual(
      [
        'atk', 'mag', 'def', 'atk_delay', 'mag_delay',
        'max_hp', 'max_st', 'max_mp', 'hit', 'eva',
        'res_fire', 'res_earth', 'res_water', 'res_wind', 'res_none',
        'max_weight', 'move_speed',
      ].sort()
    )
  })
})

describe('アセット選択肢', () => {
  it('設置個所・特殊機能が design.md の定義と一致する', () => {
    expect(ASSET_PLACEMENTS).toEqual(['床', '壁', '天井'])
    expect(ASSET_FUNCTIONS).toEqual(['販売員', '銀行', 'タイプカプセル', '栽培', '生産施設', 'カタログ'])
  })
})
