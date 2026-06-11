import { useEffect, useState } from 'react'
import { bonusValueLabelsApi } from '../api/bonusValueLabels'
import { BONUS_VALUE_LABEL_OPTIONS } from '../utils/constants'

// 付加効果「項目名」の候補一覧。管理画面（管理者・編集者）で管理されたリストを取得して使う。
// 取得が成功すればその内容（空配列を含む）をそのまま採用し、管理リストを正とする。
// 組み込みの定数は「読み込み中の初期表示」と「通信失敗時のフォールバック」にのみ使用する。
export function useBonusValueLabels(): string[] {
  const [labels, setLabels] = useState<string[]>(BONUS_VALUE_LABEL_OPTIONS)

  useEffect(() => {
    let active = true
    bonusValueLabelsApi
      .list()
      .then((r) => {
        // 管理リストを正とする。成功時は空配列でもサーバーの内容を反映する。
        if (active && Array.isArray(r.data)) setLabels(r.data)
      })
      .catch(() => {
        /* 通信失敗時のみ既定値（定数）のまま */
      })
    return () => {
      active = false
    }
  }, [])

  return labels
}
