import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { boardApi } from '../api/board'
import { useAsync } from '../hooks/useAsync'
import Spinner from '../components/Spinner'
import type { BoardThreadSummary } from '../types'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open:     { label: '対応中',   className: 'bg-emerald-900/30 border border-emerald-700/40 text-emerald-300' },
  resolved: { label: '解決済み', className: 'bg-gray-800 border border-gray-700 text-gray-400' },
}

export default function BoardPage() {
  const [threads, setThreads] = useState<BoardThreadSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { run: runCreate, loading: creating } = useAsync()

  const load = () => {
    setLoading(true)
    boardApi.listThreads()
      .then((r) => setThreads(r.data.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = () => runCreate(async () => {
    setError('')
    if (!title.trim() || !message.trim()) {
      setError('タイトルと本文を入力してください。')
      return
    }
    try {
      await boardApi.createThread(title.trim(), message.trim())
      setTitle('')
      setMessage('')
      setShowForm(false)
      load()
    } catch {
      setError('スレッドの作成に失敗しました。')
    }
  })

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
            <label className="block text-xs text-gray-400 mb-1">タイトル <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="不具合の概要など"
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">本文 <span className="text-red-400">*</span></label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              placeholder="不具合の内容、再現手順、要望などを記載してください"
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>
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

      {/* スレッド一覧 */}
      {loading ? (
        <Spinner center />
      ) : threads.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-12">まだスレッドがありません。最初のスレッドを作成してみましょう。</p>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => {
            const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.open
            return (
              <Link
                key={t.id}
                to={`/board/${t.id}`}
                className="block bg-surface-card border border-surface-border rounded-lg px-4 py-3 hover:border-primary-500/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${badge.className}`}>{badge.label}</span>
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
