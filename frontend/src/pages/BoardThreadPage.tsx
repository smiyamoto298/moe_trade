import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { boardApi } from '../api/board'
import { useAuth } from '../contexts/AuthContext'
import Spinner from '../components/Spinner'
import type { BoardThread, BoardPost } from '../types'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open:     { label: '対応中',   className: 'bg-emerald-900/30 border border-emerald-700/40 text-emerald-300' },
  resolved: { label: '解決済み', className: 'bg-gray-800 border border-gray-700 text-gray-400' },
}

export default function BoardThreadPage() {
  const { id } = useParams()
  const threadId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [thread, setThread] = useState<BoardThread | null>(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = () => {
    setLoading(true)
    boardApi.getThread(threadId)
      .then((r) => setThread(r.data))
      .catch(() => setThread(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.posts])

  const send = async () => {
    if (!input.trim() || sending || !thread) return
    setSending(true)
    try {
      const res = await boardApi.postMessage(thread.id, input.trim())
      setThread((prev) => prev ? { ...prev, posts: [...prev.posts, res.data] } : prev)
      setInput('')
    } finally {
      setSending(false)
    }
  }

  const toggleStatus = async () => {
    if (!thread) return
    const next = thread.status === 'open' ? 'resolved' : 'open'
    const res = await boardApi.updateStatus(thread.id, next)
    setThread((prev) => prev ? { ...prev, status: res.data.status } : prev)
  }

  const handleDeleteThread = async () => {
    if (!thread || !confirm('このスレッドを削除しますか？（投稿もすべて削除されます）')) return
    await boardApi.deleteThread(thread.id)
    navigate('/board')
  }

  const handleDeletePost = async (post: BoardPost) => {
    if (!thread || !confirm('この投稿を削除しますか？')) return
    await boardApi.deletePost(post.id)
    setThread((prev) => prev ? { ...prev, posts: prev.posts.filter((p) => p.id !== post.id) } : prev)
  }

  if (loading) return <Spinner center />
  if (!thread) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-gray-500">スレッドが見つかりませんでした。</p>
        <Link to="/board" className="text-sm text-primary-400 hover:underline mt-2 inline-block">掲示板へ戻る</Link>
      </div>
    )
  }

  const isMine = (userId: number) => user?.id === userId
  const badge = STATUS_BADGE[thread.status] ?? STATUS_BADGE.open

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link to="/board" className="text-xs text-gray-400 hover:text-white transition-colors">‹ 運営掲示板へ戻る</Link>

      {/* スレッドヘッダー */}
      <div className="mt-2 mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${badge.className}`}>{badge.label}</span>
            <h1 className="text-lg font-bold text-white break-words">{thread.title}</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            作成者: {thread.author_name} ・ {new Date(thread.created_at).toLocaleString('ja-JP')}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={toggleStatus}
              className="text-xs bg-surface hover:bg-surface-border border border-surface-border text-gray-300 rounded px-2.5 py-1 transition-colors"
            >
              {thread.status === 'open' ? '解決済みにする' : '対応中に戻す'}
            </button>
            <button
              onClick={handleDeleteThread}
              className="text-xs bg-red-900/30 hover:bg-red-900/50 border border-red-700/40 text-red-300 rounded px-2.5 py-1 transition-colors"
            >
              削除
            </button>
          </div>
        )}
      </div>

      {/* 全員に見える旨の注意 */}
      <div className="mb-4 bg-yellow-900/30 border border-yellow-700/40 rounded-md px-3 py-2 text-xs text-yellow-200 leading-relaxed">
        ⚠ このスレッドの投稿は、ログイン中のすべてのユーザーが閲覧できます。個人情報は書き込まないでください。
      </div>

      {/* 投稿一覧（チャット） */}
      <div className="space-y-3">
        {thread.posts.map((post) => {
          const mine = isMine(post.user_id)
          return (
            <div key={post.id} className={`flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
              <p className="text-xs text-gray-500">{post.author_name}</p>
              <div className={`group relative max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words ${
                mine ? 'bg-primary-500 text-white rounded-tr-sm' : 'bg-surface-border text-gray-100 rounded-tl-sm'
              }`}>
                {post.message}
                {isAdmin && (
                  <button
                    onClick={() => handleDeletePost(post)}
                    className="absolute -top-2 -right-2 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-red-600 text-white text-xs"
                    title="投稿を削除"
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-600">
                {new Date(post.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄 */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          placeholder="メッセージを入力..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          maxLength={5000}
          className="flex-1 bg-surface border border-surface-border rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white rounded-full w-10 h-10 flex items-center justify-center shrink-0 transition-colors"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
