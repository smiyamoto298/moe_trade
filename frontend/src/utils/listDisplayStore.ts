// 出品一覧・買取一覧の表示モード（詳細 / シンプル）を端末ごとに保持する。
// サーバーには送らないため、同じアカウントでも端末ごとに好みの密度で見られる。

/** 'detailed' = 全列表示（既定）、'compact' = アイテム名・サーバー・価格・操作のみ */
export type ListDisplayMode = 'detailed' | 'compact'

// 出品一覧と買取一覧で同じキーを共有する（片方で切り替えたらもう片方も同じ密度になる）
export const LIST_DISPLAY_MODE_KEY = 'moe_list_display_mode'

/** 現在の表示モード。未設定（既定）は 'detailed'。 */
export function getListDisplayMode(): ListDisplayMode {
  try {
    return localStorage.getItem(LIST_DISPLAY_MODE_KEY) === 'compact' ? 'compact' : 'detailed'
  } catch {
    return 'detailed'
  }
}

export function setListDisplayMode(mode: ListDisplayMode): void {
  try {
    // 既定値は保存しない（キーが無い＝詳細表示）
    if (mode === 'compact') localStorage.setItem(LIST_DISPLAY_MODE_KEY, 'compact')
    else localStorage.removeItem(LIST_DISPLAY_MODE_KEY)
  } catch {
    /* noop */
  }
}
