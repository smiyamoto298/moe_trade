import { describe, it, expect } from 'vitest'
import { applyCopyRename, emptyCopyRename, type CopyRename } from './copyRename'

// design.md「管理機能」コピーして編集:
// コピーダイアログで入力した「文字置換（複数指定可・上から順に適用）・末尾に追加」を
// セット名・各部位アイテム名それぞれに適用する（各置換は出現箇所すべて）

const rename = (replacements: CopyRename['replacements'], suffix = ''): CopyRename =>
  ({ replacements, suffix })

describe('applyCopyRename', () => {
  it('置換対象の出現箇所をすべて置換し、末尾を追加する', () => {
    expect(applyCopyRename('騎士セットの騎士剣', rename([{ search: '騎士', replace: '女王' }], '(染色可)')))
      .toBe('女王セットの女王剣(染色可)')
  })

  it('複数の置換を上から順に適用する', () => {
    expect(applyCopyRename('騎士セットの頭', rename([
      { search: '騎士', replace: '女王' },
      { search: 'の頭', replace: 'のヘルム' },
    ], '(改)'))).toBe('女王セットのヘルム(改)')
  })

  it('前の置換結果に次の置換がかかる', () => {
    expect(applyCopyRename('騎士セット', rename([
      { search: '騎士', replace: '女王' },
      { search: '女王セット', replace: 'クイーンセット' },
    ]))).toBe('クイーンセット')
  })

  it('置換対象が空の行は無視し、末尾だけ追加する', () => {
    expect(applyCopyRename('騎士セット', rename([{ search: '', replace: '女王' }], '(染色可)')))
      .toBe('騎士セット(染色可)')
  })

  it('置換後が空なら置換対象を削除する', () => {
    expect(applyCopyRename('騎士セット(染色可)', rename([{ search: '(染色可)', replace: '' }])))
      .toBe('騎士セット')
  })

  it('初期状態（すべて空）なら名前を変更しない', () => {
    expect(applyCopyRename('騎士セット', emptyCopyRename())).toBe('騎士セット')
  })

  it('rename が未指定ならそのまま返す', () => {
    expect(applyCopyRename('騎士セット', undefined)).toBe('騎士セット')
    expect(applyCopyRename('騎士セット', null)).toBe('騎士セット')
  })
})
