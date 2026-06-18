import { useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

// 登録完了後などに「元居た画面」へ戻るための遷移を返す。
// アプリ内のナビゲーション履歴がある場合はブラウザ履歴を1つ戻る（元居た画面に戻る）。
// 直リンク・初回表示などで戻り先が無い場合（location.key === 'default'）は fallback へ遷移する。
export function useGoBackOr(fallback: string) {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    if (location.key !== 'default') navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, location.key, fallback])
}
