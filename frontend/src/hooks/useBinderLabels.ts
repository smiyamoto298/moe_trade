import { useEffect, useState } from 'react'
import { binderLabelsApi } from '../api/binderLabels'

// レシピ「バインダー」の候補一覧。管理画面（管理者・編集者）で管理されたリストを取得して使う。
// 付加効果の項目名（useBonusValueLabels）と同じ仕組み。組み込みの初期候補は無いため空配列で開始する。
export function useBinderLabels(): string[] {
  const [labels, setLabels] = useState<string[]>([])

  useEffect(() => {
    let active = true
    binderLabelsApi
      .list()
      .then((r) => {
        if (active && Array.isArray(r.data)) setLabels(r.data)
      })
      .catch(() => {
        /* 通信失敗時は空配列のまま */
      })
    return () => {
      active = false
    }
  }, [])

  return labels
}
