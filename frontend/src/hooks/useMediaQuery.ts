import { useEffect, useState } from 'react'

// メディアクエリの一致状態を購読するフック。
// matchMedia が使えない環境（テストの jsdom・SSR 等）では fallback（既定 true）を返す。
// アイテムボックス一覧の「テーブル ⇔ モバイルカード」切替などレイアウト分岐に使う。
export function useMediaQuery(query: string, fallback = true): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const [matches, setMatches] = useState<boolean>(() =>
    supported ? window.matchMedia(query).matches : fallback
  )

  useEffect(() => {
    if (!supported) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query, supported])

  return matches
}
