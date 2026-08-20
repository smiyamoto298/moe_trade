import { describe, it, expect } from 'vitest'
import { getListDisplayMode, setListDisplayMode, LIST_DISPLAY_MODE_KEY } from './listDisplayStore'

// design.md「出品一覧・買取一覧の表示モード（詳細 / シンプル）」:
// - 選択は端末ごとに localStorage（キー moe_list_display_mode）へ保存する
// - 既定は詳細表示。詳細を選んだらキーを消す（未設定＝詳細）

describe('listDisplayStore', () => {
  it('未設定のときは詳細表示を返す', () => {
    expect(getListDisplayMode()).toBe('detailed')
  })

  it('シンプルを保存すると localStorage に記録され、読み戻せる', () => {
    setListDisplayMode('compact')
    expect(localStorage.getItem(LIST_DISPLAY_MODE_KEY)).toBe('compact')
    expect(getListDisplayMode()).toBe('compact')
  })

  it('詳細に戻すとキーごと削除する（既定値は保存しない）', () => {
    setListDisplayMode('compact')
    setListDisplayMode('detailed')
    expect(localStorage.getItem(LIST_DISPLAY_MODE_KEY)).toBeNull()
    expect(getListDisplayMode()).toBe('detailed')
  })

  it('不正な保存値は詳細表示として扱う', () => {
    localStorage.setItem(LIST_DISPLAY_MODE_KEY, 'なにか')
    expect(getListDisplayMode()).toBe('detailed')
  })
})
