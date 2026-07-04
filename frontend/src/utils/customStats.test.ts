import { describe, it, expect } from 'vitest'
import { splitBaseStats, mergeBaseStats } from './customStats'

// design.md「追加効果（base_stats）」: 固定パラメータに加え「その他」として
// 自由入力の項目名をキーにした追加キーを base_stats に保存する。

describe('splitBaseStats', () => {
  it('固定パラメータとその他（自由入力キー）を分離する', () => {
    const { fixed, custom } = splitBaseStats({ atk: 10, 釣り: 5, max_hp: -3 })
    expect(fixed).toEqual({ atk: '10', max_hp: '-3' })
    expect(custom).toEqual([{ label: '釣り', value: '5' }])
  })

  it('null / undefined は空として扱う', () => {
    expect(splitBaseStats(null)).toEqual({ fixed: {}, custom: [] })
    expect(splitBaseStats(undefined)).toEqual({ fixed: {}, custom: [] })
  })
})

describe('mergeBaseStats', () => {
  it('固定パラメータとその他の行を base_stats へマージする', () => {
    const merged = mergeBaseStats({ atk: '10', mag: '' }, [
      { label: '釣り', value: '5' },
      { label: ' 採掘 ', value: '-2' }, // 前後空白は除去
    ])
    expect(merged).toEqual({ atk: 10, 釣り: 5, 採掘: -2 })
  })

  it('空の項目名・空の値の行は除外する', () => {
    const merged = mergeBaseStats({}, [
      { label: '', value: '5' },
      { label: '釣り', value: '' },
    ])
    expect(merged).toEqual({})
  })

  it('固定パラメータと同じキー名の自由入力は無視する（上書き事故防止）', () => {
    const merged = mergeBaseStats({ atk: '10' }, [{ label: 'atk', value: '999' }])
    expect(merged).toEqual({ atk: 10 })
  })
})
