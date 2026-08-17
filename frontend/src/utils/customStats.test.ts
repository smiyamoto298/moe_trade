import { describe, it, expect } from 'vitest'
import { splitBaseStats, mergeBaseStats } from './customStats'

// design.md「追加効果（base_stats）」: 固定パラメータに加え「その他」として
// 自由入力の項目名をキーにした追加キーを base_stats に保存する。
// その他の値は行ごとに「数値 / テキスト」を選べる（テキストは文字列のまま保存）。

describe('splitBaseStats', () => {
  it('固定パラメータとその他（自由入力キー）を分離する', () => {
    const { fixed, custom } = splitBaseStats({ atk: 10, 釣り: 5, max_hp: -3 })
    expect(fixed).toEqual({ atk: '10', max_hp: '-3' })
    expect(custom).toEqual([{ label: '釣り', value: '5', kind: 'number' }])
  })

  it('数値にできないその他の値は kind=text として復元する', () => {
    const { custom } = splitBaseStats({ 釣り: 5, 発動条件: '水中のみ', 数値文字列: '12' })
    expect(custom).toEqual([
      { label: '釣り', value: '5', kind: 'number' },
      { label: '発動条件', value: '水中のみ', kind: 'text' },
      // 数値として解釈できる文字列は数値扱い（旧データが文字列で入っていても崩れない）
      { label: '数値文字列', value: '12', kind: 'number' },
    ])
  })

  it('null / undefined は空として扱う', () => {
    expect(splitBaseStats(null)).toEqual({ fixed: {}, custom: [] })
    expect(splitBaseStats(undefined)).toEqual({ fixed: {}, custom: [] })
  })
})

describe('mergeBaseStats', () => {
  it('固定パラメータとその他の行を base_stats へマージする', () => {
    const merged = mergeBaseStats({ atk: '10', mag: '' }, [
      { label: '釣り', value: '5', kind: 'number' },
      { label: ' 採掘 ', value: '-2', kind: 'number' }, // 前後空白は除去
    ])
    expect(merged).toEqual({ atk: 10, 釣り: 5, 採掘: -2 })
  })

  it('kind=text の行は文字列のまま保存する（前後空白は除去）', () => {
    const merged = mergeBaseStats({}, [
      { label: '発動条件', value: ' 水中のみ ', kind: 'text' },
      { label: '倍率表記', value: '1.5', kind: 'text' }, // 数値に見えてもテキストなら文字列
    ])
    expect(merged).toEqual({ 発動条件: '水中のみ', 倍率表記: '1.5' })
  })

  it('空の項目名・空の値の行は除外する', () => {
    const merged = mergeBaseStats({}, [
      { label: '', value: '5', kind: 'number' },
      { label: '釣り', value: '', kind: 'number' },
      { label: '発動条件', value: '   ', kind: 'text' }, // 空白のみのテキストも除外
    ])
    expect(merged).toEqual({})
  })

  it('kind=number で数値にできない値は送らない（NaN 防止）', () => {
    const merged = mergeBaseStats({}, [
      { label: '釣り', value: 'abc', kind: 'number' },
      { label: '採掘', value: '3', kind: 'number' },
    ])
    expect(merged).toEqual({ 採掘: 3 })
  })

  it('固定パラメータと同じキー名の自由入力は無視する（上書き事故防止）', () => {
    const merged = mergeBaseStats({ atk: '10' }, [
      { label: 'atk', value: '999', kind: 'number' },
      { label: 'max_hp', value: 'テキスト', kind: 'text' },
    ])
    expect(merged).toEqual({ atk: 10 })
  })
})
