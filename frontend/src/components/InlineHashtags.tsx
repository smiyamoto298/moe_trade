import { useState } from 'react'
import type { ItemHashtag } from '../types'
import { itemsApi } from '../api/items'
import { parseHashtags, formatHashtags } from '../utils/hashtags'
import HashtagList from './HashtagList'

/**
 * アイテム名の下などに置く、クリックで編集できるハッシュタグ表示。
 * - 表示時はチップ（固定タグは📌・読み取り専用）。未登録かつ編集可なら「#ハッシュタグ」プレースホルダ。
 * - クリックすると1つのテキストボックスで通常タグをまとめて編集（例: #和風 #袴）。
 *   固定タグは編集対象外（運営がアイテム編集画面で設定）。
 * - 保存はユーザータグの総入れ替え（wiki型・ログイン必須）。
 */
export default function InlineHashtags({
  itemId,
  hashtags,
  editable,
  size = 'md',
  className = '',
  onSaved,
}: {
  itemId: number
  hashtags: ItemHashtag[] | undefined | null
  editable: boolean
  size?: 'sm' | 'md'
  className?: string
  onSaved?: (hashtags: ItemHashtag[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const list = hashtags ?? []
  const fixed = list.filter((h) => h.is_fixed)
  const userTags = list.filter((h) => !h.is_fixed)

  const startEdit = () => {
    if (!editable || saving) return
    setValue(formatHashtags(userTags))
    setError('')
    setEditing(true)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const r = await itemsApi.replaceHashtags(itemId, parseHashtags(value))
      onSaved?.(r.data)
      setEditing(false)
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } })?.response
      setError(res?.data?.message ?? 'ハッシュタグの保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className={`space-y-1.5 ${className}`} onClick={(e) => e.stopPropagation()}>
        {/* 固定タグは編集対象外。存在する場合は参考表示する */}
        {fixed.length > 0 && <HashtagList hashtags={fixed} size={size} />}
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void save() }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
          }}
          placeholder="#和風 #袴（スペース区切り）"
          className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="text-gray-400 hover:text-white px-2 py-1 rounded text-xs transition-colors"
          >
            キャンセル
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  // 表示モード
  if (list.length === 0) {
    if (!editable) return null
    return (
      <button
        type="button"
        onClick={startEdit}
        className={`text-gray-600 hover:text-primary-400 transition-colors ${size === 'sm' ? 'text-[11px]' : 'text-xs'} ${className}`}
        title="クリックしてハッシュタグを追加"
      >
        #ハッシュタグ
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={editable ? startEdit : undefined}
      title={editable ? 'クリックしてハッシュタグを編集' : undefined}
      className={`block text-left ${editable ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'} ${className}`}
    >
      <HashtagList hashtags={list} size={size} />
    </button>
  )
}
