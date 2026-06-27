/**
 * 公式DB（MasterOfEpic公式サイト・moepic.com のアイテムページ）へのリンク。
 *
 * 出品一覧・買取一覧・各詳細など、行や Link カードの内側に置かれることもあるため、
 * <a> の入れ子を避けて button + window.open で新しいウィンドウに開く。
 * クリックは親の Link 遷移を発火させないよう stopPropagation する。
 */
interface Props {
  url?: string | null
  className?: string
  size?: 'sm' | 'md'
}

export default function OfficialDbLink({ url, className = '', size = 'sm' }: Props) {
  if (!url) return null

  const open = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const textSize = size === 'md' ? 'text-sm' : 'text-xs'

  return (
    <button
      type="button"
      onClick={open}
      title="公式サイトのアイテムページを新しいウィンドウで開く"
      className={`inline-flex items-center gap-1 ${textSize} text-sky-400 hover:text-sky-300 hover:underline transition-colors ${className}`}
    >
      📖 公式DB
      <span aria-hidden="true">↗</span>
    </button>
  )
}
