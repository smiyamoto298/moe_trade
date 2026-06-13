import { describe, it, expect } from 'vitest'
import { parseItemBox, isTransferNg } from './itemBoxPaste'

const HEADER = 'No▼\tアイテム名\tカテゴリ\t転送\t個数'

describe('parseItemBox', () => {
  it('ヘッダー行・空行を読み飛ばし、転送○/×の両方を rows に含める', () => {
    const text = [
      HEADER,
      '',
      '1\tアイネの抱っこぬいぐるみ\t中級者レア\t○\t1',
      '2\tトレード不可の杖\tレア\t×\t1',
    ].join('\n')
    const { rows, noCellSkipped } = parseItemBox(text)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ no: '1', name: 'アイネの抱っこぬいぐるみ', category: '中級者レア', count: 1, tenso: '○' })
    expect(rows[1]).toMatchObject({ name: 'トレード不可の杖', tenso: '×' })
    expect(noCellSkipped).toBe(0)
  })

  it('レンタル列がある形式でも「転送」セル基準で正しく解析する', () => {
    const text = [
      'レンタル\tNo▼\tアイテム名\tカテゴリ\t転送\t個数',
      'レンタル中\t5\t鉄の剣\t武器\t○\t2',
    ].join('\n')
    const { rows } = parseItemBox(text)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ no: '5', name: '鉄の剣', category: '武器', count: 2 })
  })

  it('「空き」スロットは転送状態で emptyExcluded / emptySkipped に振り分ける', () => {
    const text = [
      '1\t空き\t-\t○\t0',
      '2\t空き\t-\t×\t0',
      '3\t普通の剣\t武器\t○\t1',
    ].join('\n')
    const { rows, emptyExcluded, emptySkipped } = parseItemBox(text)
    expect(rows.map((r) => r.name)).toEqual(['普通の剣'])
    expect(emptyExcluded).toBe(1) // × の空き
    expect(emptySkipped).toBe(1)  // ○ の空き
  })

  it('転送セルが見つからない行は noCellSkipped に数える', () => {
    const { rows, noCellSkipped } = parseItemBox('ただのテキスト行\nもう一行')
    expect(rows).toHaveLength(0)
    expect(noCellSkipped).toBe(2)
  })

  it('個数のカンマ区切りを数値として読み取る', () => {
    const { rows } = parseItemBox('1\tギガース ハンマー\t武器\t○\t1,234')
    expect(rows[0].count).toBe(1234)
  })

  it('省略表記（末尾「...」「…」）の名前はそのまま保持する', () => {
    const { rows } = parseItemBox('1\tロングソードオブナントカ...\t武器\t○\t1')
    expect(rows[0].name).toBe('ロングソードオブナントカ...')
  })

  it('isTransferNg は × / ✕ / x を不可と判定する', () => {
    expect(isTransferNg('×')).toBe(true)
    expect(isTransferNg('✕')).toBe(true)
    expect(isTransferNg('x')).toBe(true)
    expect(isTransferNg('○')).toBe(false)
  })
})
