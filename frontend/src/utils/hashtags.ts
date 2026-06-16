import type { ItemHashtag } from '../types'

/**
 * テキストボックスの入力（例: "#和風 #袴 かっこいい"）をタグ配列へ変換する。
 * 先頭の # / ＃ を除去し、空白・カンマ・読点で分割、大文字小文字を無視して重複排除、最大50文字。
 */
export function parseHashtags(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(/[\s,、]+/)) {
    const tag = raw.replace(/^[#＃]+/, '').trim().slice(0, 50)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/**
 * タグ配列を "#和風 #袴" 形式のテキストへ変換する（テキストボックスの初期値用）。
 */
export function formatHashtags(tags: (ItemHashtag | string)[] | undefined | null): string {
  if (!tags) return ''
  return tags.map((t) => `#${typeof t === 'string' ? t : t.tag}`).join(' ')
}
