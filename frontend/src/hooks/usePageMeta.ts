import { useEffect } from 'react'

export const DEFAULT_TITLE = 'MoE Trade — Master of Epic 取引所'
export const DEFAULT_DESCRIPTION =
  'Master of Epic のアイテム取引所。出品・検索・取引チャットでスムーズにアイテムを売買できます。'

/**
 * ページごとの <title> と meta description を設定する。
 * SPA のままでも Googlebot はレンダリング後のタイトル・説明をインデックスに使うため、
 * 出品・買取の詳細ページでアイテム名を含めることで検索にヒットしやすくする。
 *
 * title は「◯◯ | MoE Trade」の形に整形される。null/undefined の間（データ読込中など）は
 * 既定値を維持し、アンマウント時に既定値へ戻す。
 */
export function usePageMeta(title?: string | null, description?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | MoE Trade` : DEFAULT_TITLE

    const meta = document.querySelector('meta[name="description"]')
    meta?.setAttribute('content', description ?? DEFAULT_DESCRIPTION)

    return () => {
      document.title = DEFAULT_TITLE
      meta?.setAttribute('content', DEFAULT_DESCRIPTION)
    }
  }, [title, description])
}
