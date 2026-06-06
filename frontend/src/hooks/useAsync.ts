import { useState, useCallback } from 'react'

/**
 * 非同期処理の二重送信防止 + ローディング管理フック
 * @returns { run, loading }
 *   run(fn) — fn が実行中は再呼び出しを無視し、loading を true にする
 */
export function useAsync() {
  const [loading, setLoading] = useState(false)

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (loading) return
    setLoading(true)
    try {
      await fn()
    } finally {
      setLoading(false)
    }
  }, [loading])

  return { run, loading }
}
