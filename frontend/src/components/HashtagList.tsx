import type { ItemHashtag } from '../types'

/**
 * ハッシュタグのチップ表示（読み取り専用）。固定タグ（is_fixed）は📌付きの色で区別する。
 * 追加・削除・絞り込みの操作は持たない（編集は InlineHashtags、絞り込みは一覧上部の入力で行う）。
 */
export default function HashtagList({
  hashtags,
  size = 'md',
  className = '',
}: {
  hashtags: ItemHashtag[] | undefined | null
  size?: 'sm' | 'md'
  className?: string
}) {
  if (!hashtags || hashtags.length === 0) return null

  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {hashtags.map((h) => (
        <span
          key={h.id}
          className={`inline-flex items-center rounded border ${pad} whitespace-nowrap bg-surface border-surface-border text-gray-300`}
        >
          {/* 固定タグは色では強調せず、ピンアイコンだけで区別する */}
          {h.is_fixed && <span className="mr-0.5" aria-hidden="true">📌</span>}#{h.tag}
        </span>
      ))}
    </div>
  )
}
