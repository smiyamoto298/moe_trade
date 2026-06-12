import { describe, it, expect } from 'vitest'
import { parsePaste } from './BulkListingPage'

// design.md「一括出品」:
// 公式サイトの所持アイテム一覧（タブ区切り）の貼り付けを解析する。
// - 列は「転送（○/×）」セルを基準に相対位置で解析（レンタル列の有無どちらでも動作）
// - 転送が × のデータ・「空き」スロットは除外（除外件数を表示）
// - ヘッダー行・空行は読み飛ばす

const HEADER = 'No▼\tアイテム名\tカテゴリ\t転送\t個数'

describe('parsePaste', () => {
  it('ヘッダー行・空行を読み飛ばし、データ行を解析する', () => {
    const text = [
      HEADER,
      '',
      '1\tアイネの抱っこぬいぐるみ\t中級者レア\t○\t1',
      '3\tアクアマリン\t中級者アンコモン\t○\t321',
    ].join('\n')
    const { rows, excluded, skipped } = parsePaste(text)
    expect(rows).toHaveLength(2)
    expect(excluded).toBe(0)
    expect(skipped).toBe(0)
    expect(rows[0]).toMatchObject({
      no: '1',
      name: 'アイネの抱っこぬいぐるみ',
      category: '中級者レア',
      count: 1,
      item: null,
      listQty: '0', // 出品数のデフォルトは 0
    })
    expect(rows[1].count).toBe(321)
  })

  it('レンタル列がある形式でも「転送」セル基準で正しく解析する', () => {
    const text = [
      'レンタル\tNo▼\tアイテム名\tカテゴリ\t転送\t個数',
      'レンタル中\t5\t鉄の剣\t武器\t○\t2',
    ].join('\n')
    const { rows } = parsePaste(text)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ no: '5', name: '鉄の剣', category: '武器', count: 2 })
  })

  it('転送が × の行は除外し、件数を数える（✕ / x 表記も同様）', () => {
    const text = [
      '1\tトレード不可の杖\tレア\t×\t1',
      '2\tトレード不可の盾\tレア\t✕\t1',
      '3\tトレード不可の靴\tレア\tx\t1',
      '4\t普通の剣\t武器\t○\t1',
    ].join('\n')
    const { rows, excluded } = parsePaste(text)
    expect(rows.map((r) => r.name)).toEqual(['普通の剣'])
    expect(excluded).toBe(3)
  })

  it('「空き」スロットは登録対象にしない', () => {
    const text = [
      '1\t空き\t-\t○\t0',
      '2\t空き\t-\t×\t0',
      '3\t普通の剣\t武器\t○\t1',
    ].join('\n')
    const { rows, excluded, skipped } = parsePaste(text)
    expect(rows).toHaveLength(1)
    expect(excluded).toBe(1) // × の空きは除外件数
    expect(skipped).toBe(1)  // ○ の空きはスキップ件数
  })

  it('転送セルが見つからない行はスキップ扱いになる', () => {
    const { rows, skipped } = parsePaste('ただのテキスト行\nもう一行')
    expect(rows).toHaveLength(0)
    expect(skipped).toBe(2)
  })

  it('個数のカンマ区切りを数値として読み取る', () => {
    const { rows } = parsePaste('1\tギガース ハンマー\t武器\t○\t1,234')
    expect(rows[0].count).toBe(1234)
  })

  it('省略表記（末尾「...」「…」）の名前はそのまま保持する（照合は API 側で前方一致）', () => {
    const { rows } = parsePaste('1\tロングソードオブナントカ...\t武器\t○\t1')
    expect(rows[0].name).toBe('ロングソードオブナントカ...')
  })
})
