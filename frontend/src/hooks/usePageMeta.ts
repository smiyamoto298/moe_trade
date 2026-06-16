import { useEffect } from 'react'

// ゲーム名の表記ゆれ（カタカナ・英語・略称）を1か所に集約し、各ページの title/description で
// 一貫して使う。日本のプレイヤーは「マスターオブエピック」（カタカナ）で検索することが多い一方、
// 「Master of Epic」「MoE/moe」での検索もあるため、全バリアントを含めて取りこぼしを防ぐ。
// 検索は大文字小文字を区別しないので「moe/moE」は「MoE」表記で自動的にカバーされる。
export const SITE_BRAND = 'マスターオブエピック（Master of Epic / MoE）'

export const DEFAULT_TITLE = 'MoE Trade — マスターオブエピック（Master of Epic）取引所'
export const DEFAULT_DESCRIPTION =
  `${SITE_BRAND}のアイテム取引所。出品・検索・取引チャットでスムーズにアイテムを売買できます。`

// canonical / 構造化データの絶対URLに使う本番オリジン。開発・ステージングのホスト名に
// 関わらず、検索エンジンへ伝える正規URLは常に本番ドメインにする（重複URLの分散を防ぐ）。
export const SITE_ORIGIN = 'https://moe-trade.sakuraweb.com'

export interface PageMetaOptions {
  /** 正規URL（canonical）のパス（例: "/items/12"）。同一内容が複数URLに出るのを防ぎ、評価を1URLへ集約する */
  canonicalPath?: string | null
  /** 構造化データ（JSON-LD）。Product 等のオブジェクトを渡すと <script type="application/ld+json"> を出力する */
  jsonLd?: object | null
  /** true のとき <meta name="robots" content="noindex"> を出力し、検索インデックスから除外する（未確認アイテム等） */
  noindex?: boolean
}

// このフックが管理する head 要素の目印（クリーンアップ時に確実に除去するため）
const CANONICAL_ATTR = 'data-page-canonical'
const JSONLD_ATTR = 'data-page-jsonld'
const ROBOTS_ATTR = 'data-page-robots'

function removeManaged(attr: string) {
  document.head.querySelectorAll(`[${attr}]`).forEach((el) => el.remove())
}

/**
 * ページごとの <title> / meta description と、SEO 用の canonical・JSON-LD・noindex を設定する。
 * SPA のままでも Googlebot はレンダリング後のこれらをインデックスに使うため、
 * アイテム名を含むタイトルや構造化データで検索にヒット・上位化しやすくする。
 *
 * title は「◯◯ | MoE Trade」の形に整形される。null/undefined の間（データ読込中など）は
 * 既定値を維持し、アンマウント時に既定値へ戻す（追加した head 要素も除去する）。
 */
export function usePageMeta(
  title?: string | null,
  description?: string | null,
  options?: PageMetaOptions,
) {
  const { canonicalPath, jsonLd, noindex } = options ?? {}
  // オブジェクトは毎レンダリングで参照が変わりうるため、依存配列には文字列化した値を使う
  const jsonLdString = jsonLd ? JSON.stringify(jsonLd) : null

  useEffect(() => {
    document.title = title ? `${title} | MoE Trade` : DEFAULT_TITLE

    const meta = document.querySelector('meta[name="description"]')
    meta?.setAttribute('content', description ?? DEFAULT_DESCRIPTION)

    // canonical（このフックの管理分を一旦消してから設定）
    removeManaged(CANONICAL_ATTR)
    if (canonicalPath) {
      const link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      link.setAttribute('href', SITE_ORIGIN + canonicalPath)
      link.setAttribute(CANONICAL_ATTR, '')
      document.head.appendChild(link)
    }

    // robots noindex
    removeManaged(ROBOTS_ATTR)
    if (noindex) {
      const robots = document.createElement('meta')
      robots.setAttribute('name', 'robots')
      robots.setAttribute('content', 'noindex')
      robots.setAttribute(ROBOTS_ATTR, '')
      document.head.appendChild(robots)
    }

    // JSON-LD 構造化データ
    removeManaged(JSONLD_ATTR)
    if (jsonLdString) {
      const script = document.createElement('script')
      script.setAttribute('type', 'application/ld+json')
      script.setAttribute(JSONLD_ATTR, '')
      script.textContent = jsonLdString
      document.head.appendChild(script)
    }

    return () => {
      document.title = DEFAULT_TITLE
      meta?.setAttribute('content', DEFAULT_DESCRIPTION)
      removeManaged(CANONICAL_ATTR)
      removeManaged(ROBOTS_ATTR)
      removeManaged(JSONLD_ATTR)
    }
  }, [title, description, canonicalPath, noindex, jsonLdString])
}
