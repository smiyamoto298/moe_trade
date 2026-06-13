import { describe, it, expect } from 'vitest'
import {
  ALL_SKILLS,
  SKILL_GROUPS,
  MASTERIES,
  MASTERY_BY_CODE,
  SPECIAL_CONDITIONS,
  BASE_STAT_LABELS,
  STAT_INPUT_COLUMNS,
  ASSET_PLACEMENTS,
  ASSET_FUNCTIONS,
  formatSignedValue,
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

  it('キーの定義順がセレクトボックスの表示順（STAT_INPUT_COLUMNS の1列目→2列目→3列目）と一致する', () => {
    expect(Object.keys(BASE_STAT_LABELS)).toEqual(STAT_INPUT_COLUMNS.flat())
  })
})

describe('STAT_INPUT_COLUMNS', () => {
  it('design.md の追加効果入力欄の並び（3列構成）と一致する', () => {
    expect(STAT_INPUT_COLUMNS).toEqual([
      ['max_hp', 'max_st', 'max_mp', 'move_speed', 'max_weight', 'atk_delay', 'mag_delay'],
      ['atk', 'mag', 'def', 'hit', 'eva'],
      ['res_fire', 'res_water', 'res_earth', 'res_wind', 'res_none'],
    ])
  })

  it('BASE_STAT_LABELS の全キーを過不足・重複なく含む', () => {
    const flat = STAT_INPUT_COLUMNS.flat()
    expect(new Set(flat).size).toBe(flat.length)
    expect(flat.sort()).toEqual(Object.keys(BASE_STAT_LABELS).sort())
  })
})

describe('formatSignedValue', () => {
  // design.md「追加効果・付加効果の数値は - 付き以外に + を付けて表示」の仕様
  it('負数以外には + を付ける', () => {
    expect(formatSignedValue(5)).toBe('+5')
    expect(formatSignedValue(0)).toBe('+0')
    expect(formatSignedValue(1.5)).toBe('+1.5')
    expect(formatSignedValue('15')).toBe('+15')
  })

  it('負数（- 付き）はそのまま表示する', () => {
    expect(formatSignedValue(-3)).toBe('-3')
    expect(formatSignedValue('-0.5')).toBe('-0.5')
  })

  it('倍率（value_unit === "x"）は + を付けない', () => {
    expect(formatSignedValue(1.5, 'x')).toBe('1.5')
    expect(formatSignedValue(-1.5, 'x')).toBe('-1.5')
    // 倍率以外の単位は + を付ける
    expect(formatSignedValue(15, '%')).toBe('+15')
    expect(formatSignedValue(41.25, 'per_min')).toBe('+41.25')
  })
})

describe('アセット選択肢', () => {
  it('設置個所・特殊機能が design.md の定義と一致する', () => {
    expect(ASSET_PLACEMENTS).toEqual(['床', '壁', '天井'])
    expect(ASSET_FUNCTIONS).toEqual(['販売員', '銀行', 'タイプカプセル', '栽培', '生産施設', 'カタログ'])
  })
})
