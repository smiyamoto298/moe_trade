import { useEffect, useState } from 'react'
import { announcementsApi } from '../../api/announcements'
import type { Announcement, AnnouncementLevel } from '../../types'
import { useDialog } from '../../contexts/DialogContext'
import { useDragReorder } from '../../hooks/useDragReorder'

interface Draft {
  id: number | null
  message: string
  level: AnnouncementLevel
  link_url: string
  link_label: string
  is_active: boolean
  display_days: number | null
  expires_at: string | null
}

const toDraft = (a: Announcement): Draft => ({
  id: a.id,
  message: a.message,
  level: a.level,
  link_url: a.link_url ?? '',
  link_label: a.link_label ?? '',
  is_active: a.is_active,
  display_days: a.display_days ?? null,
  expires_at: a.expires_at ?? null,
})

const newDraft = (): Draft => ({
  id: null,
  message: '',
  level: 'warning',
  link_url: '',
  link_label: '',
  is_active: true,
  display_days: null,
  expires_at: null,
})

const LEVELS: { value: AnnouncementLevel; label: string }[] = [
  { value: 'info', label: '情報（青）' },
  { value: 'warning', label: '注意（黄）' },
  { value: 'error', label: '警告（赤）' },
]

const fmtDate = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function AnnouncementsAdminPage() {
  const { confirm, alert } = useDialog()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [savingIdx, setSavingIdx] = useState<number | null>(null)

  const { dragIdx, onDragStart, onDragOver, onDrop } = useDragReorder<Draft>(setDrafts, async (items) => {
    const ids = items.map((d) => d.id).filter((id): id is number => id != null)
    if (ids.length < 2) return
    try {
      await announcementsApi.reorder(ids)
    } catch {
      await alert('並び順の保存に失敗しました。', { title: 'エラー' })
      load()
    }
  })

  const load = () => {
    setLoading(true)
    announcementsApi
      .adminList()
      .then((r) => setDrafts(r.data.map(toDraft)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const setField = (idx: number, patch: Partial<Draft>) =>
    setDrafts((p) => p.map((d, i) => (i === idx ? { ...d, ...patch } : d)))

  const addNew = () => setDrafts((p) => [newDraft(), ...p])

  const save = async (idx: number) => {
    const d = drafts[idx]
    if (!d.message.trim()) {
      await alert('本文を入力してください。', { title: '入力エラー' })
      return
    }
    const payload = {
      message: d.message,
      level: d.level,
      link_url: d.link_url.trim() || null,
      link_label: d.link_label.trim() || null,
      is_active: d.is_active,
      display_days: d.display_days && d.display_days > 0 ? d.display_days : null,
    }
    setSavingIdx(idx)
    try {
      if (d.id == null) await announcementsApi.create(payload)
      else await announcementsApi.update(d.id, payload)
      load()
    } catch {
      await alert('保存に失敗しました。時間をおいて再度お試しください。', { title: 'エラー' })
    } finally {
      setSavingIdx(null)
    }
  }

  const remove = async (idx: number) => {
    const d = drafts[idx]
    if (d.id == null) {
      setDrafts((p) => p.filter((_, i) => i !== idx))
      return
    }
    if (!(await confirm('このお知らせを削除しますか？', { title: 'お知らせの削除', confirmLabel: '削除', danger: true }))) return
    try {
      await announcementsApi.remove(d.id)
      load()
    } catch {
      await alert('削除に失敗しました。', { title: 'エラー' })
    }
  }


  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h1 className="text-xl font-bold text-white">お知らせ管理</h1>
        <button
          onClick={addNew}
          className="text-sm bg-primary-500 hover:bg-primary-600 text-white px-4 py-1.5 rounded-md transition-colors"
        >
          + 新規作成
        </button>
      </div>
      <p className="text-sm text-gray-400 mb-5">
        ここで登録したお知らせがサイト上部に表示されます。「表示する」をオフにすると非表示になります。
        左上の <span className="text-gray-300">⠿</span> をドラッグするとパネルの並び順（＝表示順）を変更できます。
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : drafts.length === 0 ? (
        <div className="text-center py-10 bg-surface-card border border-surface-border rounded-lg text-sm text-gray-500">
          お知らせはありません。「+ 新規作成」から追加できます。
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((d, idx) => (
            <div
              key={d.id ?? `new-${idx}`}
              onDragOver={onDragOver(idx)}
              onDrop={onDrop}
              className={`bg-surface-card border rounded-lg p-4 space-y-3 transition-colors ${
                dragIdx === idx ? 'border-primary-500 opacity-70' : 'border-surface-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    draggable
                    onDragStart={() => onDragStart(idx)}
                    onDragEnd={onDrop}
                    title="ドラッグして並び替え"
                    className="cursor-grab active:cursor-grabbing select-none text-gray-500 hover:text-gray-300 text-lg leading-none px-1"
                  >
                    ⠿
                  </span>
                  <span className="text-xs text-gray-500">{d.id == null ? '新規（未保存）' : `ID: ${d.id}`}</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={d.is_active}
                    onChange={(e) => setField(idx, { is_active: e.target.checked })}
                    className="accent-primary-500"
                  />
                  <span className="text-xs text-gray-300">表示する</span>
                </label>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">本文</label>
                <textarea
                  rows={3}
                  value={d.message}
                  onChange={(e) => setField(idx, { message: e.target.value })}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">種別（色）</label>
                  <select
                    value={d.level}
                    onChange={(e) => setField(idx, { level: e.target.value as AnnouncementLevel })}
                    className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">リンクURL（任意）</label>
                  <input
                    type="text"
                    value={d.link_url}
                    onChange={(e) => setField(idx, { link_url: e.target.value })}
                    placeholder="https://x.com/..."
                    className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">リンク表示名（任意）</label>
                  <input
                    type="text"
                    value={d.link_label}
                    onChange={(e) => setField(idx, { link_label: e.target.value })}
                    placeholder="@senir_moe"
                    className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">表示期間（日数・任意）</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={d.display_days ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setField(idx, { display_days: v === '' ? null : Math.max(1, Number(v)) })
                      }}
                      placeholder="無期限"
                      className="w-28 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                    />
                    <span className="text-xs text-gray-500">
                      {d.display_days && d.display_days > 0
                        ? d.id != null && d.expires_at
                          ? `日間（表示期限: ${fmtDate(d.expires_at)}）`
                          : '日間（保存時の日時から起算）'
                        : '空欄で無期限表示'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => remove(idx)}
                  className="text-xs bg-red-900/40 hover:bg-red-900/70 text-red-300 px-3 py-1.5 rounded transition-colors"
                >
                  削除
                </button>
                <button
                  onClick={() => save(idx)}
                  disabled={savingIdx === idx}
                  className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-1.5 rounded-md transition-colors"
                >
                  {savingIdx === idx ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
