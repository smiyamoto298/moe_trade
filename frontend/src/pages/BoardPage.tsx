import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { boardApi } from '../api/board'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { useAsync } from '../hooks/useAsync'
import Spinner from '../components/Spinner'
import type { BoardThreadSummary, BoardThreadCategory } from '../types'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open:     { label: '対応中',   className: 'bg-emerald-900/30 border border-emerald-700/40 text-emerald-300' },
  resolved: { label: '解決済み', className: 'bg-gray-800 border border-gray-700 text-gray-400' },
}

// スレッド種別（表示順はこの定義順）
const CATEGORY_BADGE: Record<BoardThreadCategory, { label: string; className: string }> = {
  item_correction: { label: 'アイテム情報修正依頼', className: 'bg-blue-900/30 border border-blue-700/40 text-blue-300' },
  request:         { label: '要望',                 className: 'bg-teal-900/30 border border-teal-700/40 text-teal-300' },
  bug:             { label: '不具合',               className: 'bg-rose-900/30 border border-rose-700/40 text-rose-300' },
  other:           { label: 'その他',               className: 'bg-gray-800 border border-gray-700 text-gray-400' },
}
const CATEGORY_KEYS = Object.keys(CATEGORY_BADGE) as BoardThreadCategory[]

// 種別ごとの入力プレースホルダ
const CATEGORY_PLACEHOLDER: Record<BoardThreadCategory, { title: string; message: string }> = {
  item_correction: {
    title:   'アイテム名を入力してください',
    message: '誤っている内容・正しい情報を記載してください（参考画像はCtrl+Vで貼り付け可）',
  },
  request: {
    title:   '例）出品一覧に絞り込み機能がほしい',
    message: '要望の内容と、それがあると嬉しい理由を記載してください（画像はCtrl+Vで貼り付け可）',
  },
  bug: {
    title:   '例）出品ボタンを押すとエラーになる',
    message: '不具合の内容・再現手順・発生した状況を記載してください（画像はCtrl+Vで貼り付け可）',
  },
  other: {
    title:   '件名を入力してください',
    message: 'お問い合わせ内容を記載してください（画像はCtrl+Vで貼り付け可）',
  },
}

export default function BoardPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [threads, setThreads] = useState<BoardThreadSummary[]>([])
  const [onlyMine, setOnlyMine] = useState(false)
  const [hideResolved, setHideResolved] = useState(false)
  const [filterCategory, setFilterCategory] = useState<BoardThreadCategory | ''>('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState<BoardThreadCategory>('bug')
  const [adminOnly, setAdminOnly] = useState(false)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [error, setError] = useState('')

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024

  const pickImage = (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選択してください。')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('画像サイズは5MBまでです。')
      return
    }
    setError('')
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImage(null)
    setImagePreview(null)
  }

  // クリップボードからの画像貼り付け（Ctrl+V）
  const handlePaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.items)
      .find((it) => it.kind === 'file' && it.type.startsWith('image/'))
      ?.getAsFile()
    if (file) {
      e.preventDefault()
      pickImage(file)
    }
  }
  const { run: runCreate, loading: creating } = useAsync()
  const { markBoardSeen, unreadBoardThreadIds } = useNotification()

  const load = () => {
    setLoading(true)
    boardApi.listThreads(1, filterCategory || undefined)
      .then((r) => setThreads(r.data.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filterCategory])
  useEffect(() => { markBoardSeen() }, [])

  const handleCreate = () => runCreate(async () => {
    setError('')
    if (!title.trim() || !message.trim()) {
      setError('タイトルと本文を入力してください。')
      return
    }
    try {
      await boardApi.createThread(title.trim(), message.trim(), category, image, isAdmin && adminOnly)
      setTitle('')
      setMessage('')
      setCategory('bug')
      setAdminOnly(false)
      clearImage()
      setShowForm(false)
      load()
    } catch {
      setError('スレッドの作成に失敗しました。')
    }
  })

  const filteredThreads = threads.filter((t) =>
    (!onlyMine || t.user_id === user?.id) &&
    (!hideResolved || t.status !== 'resolved')
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">運営掲示板</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm bg-primary-500 hover:bg-primary-600 text-white px-4 py-1.5 rounded-md transition-colors"
        >
          {showForm ? '閉じる' : 'スレッドを作成'}
        </button>
      </div>

      {/* 全員に見える旨の注意 */}
      <div className="mb-4 bg-yellow-900/30 border border-yellow-700/40 rounded-md px-4 py-3 text-sm text-yellow-200 leading-relaxed">
        ⚠ この掲示板の投稿内容は、ログイン中のすべてのユーザーが閲覧できます。
        メールアドレスやパスワードなどの個人情報は書き込まないようご注意ください。
      </div>

      {/* スレッド作成フォーム */}
      {showForm && (
        <div className="mb-6 bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">種別 <span className="text-red-400">*</span></label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BoardThreadCategory)}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
            >
              {CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>{CATEGORY_BADGE[key].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">タイトル <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={CATEGORY_PLACEHOLDER[category].title}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">本文 <span className="text-red-400">*</span></label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={handlePaste}
              maxLength={5000}
              placeholder={CATEGORY_PLACEHOLDER[category].message}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">画像（任意・5MBまで）</label>
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="添付プレビュー" className="max-h-40 rounded-lg border border-surface-border" />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white text-xs"
                  title="画像を取り消す"
                >
                  ×
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-surface-border file:text-gray-200 hover:file:bg-surface-border/70 cursor-pointer"
              />
            )}
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300">
              <input
                type="checkbox"
                checked={adminOnly}
                onChange={(e) => setAdminOnly(e.target.checked)}
                className="accent-primary-500 w-4 h-4"
              />
              🔒 管理者のみ閲覧可（他のユーザーには表示されません）
            </label>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-md transition-colors"
          >
            {creating ? '作成中...' : '作成する'}
          </button>
        </div>
      )}

      {/* フィルター */}
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          種別
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as BoardThreadCategory | '')}
            className="bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary-500"
          >
            <option value="">すべて</option>
            {CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>{CATEGORY_BADGE[key].label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-400 hover:text-gray-200 transition-colors">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="accent-primary-500 w-3.5 h-3.5"
          />
          自分の作成したスレッド
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-400 hover:text-gray-200 transition-colors">
          <input
            type="checkbox"
            checked={hideResolved}
            onChange={(e) => setHideResolved(e.target.checked)}
            className="accent-primary-500 w-3.5 h-3.5"
          />
          解決済みを非表示
        </label>
      </div>

      {/* スレッド一覧 */}
      {loading ? (
        <Spinner center />
      ) : filteredThreads.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-12">
          {threads.length === 0
            ? 'まだスレッドがありません。最初のスレッドを作成してみましょう。'
            : '条件に一致するスレッドがありません。'}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredThreads.map((t) => {
            const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.open
            const catBadge = CATEGORY_BADGE[t.category] ?? CATEGORY_BADGE.other
            const isUnread = unreadBoardThreadIds.has(t.id)
            return (
              <Link
                key={t.id}
                to={`/board/${t.id}`}
                className="block bg-surface-card border border-surface-border rounded-lg px-4 py-3 hover:border-primary-500/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="未読の投稿があります" />}
                      <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${badge.className}`}>{badge.label}</span>
                      <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${catBadge.className}`}>{catBadge.label}</span>
                      {t.admin_only && (
                        <span className="text-xs rounded px-1.5 py-0.5 shrink-0 bg-purple-900/40 border border-purple-600/50 text-purple-200" title="管理者のみ閲覧可能">🔒 管理者限定</span>
                      )}
                      <h2 className="text-sm font-medium text-white truncate">{t.title}</h2>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {t.author_name} ・ {t.post_count}件 ・ {new Date(t.last_active_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="text-gray-600 shrink-0">›</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
