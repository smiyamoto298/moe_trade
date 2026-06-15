import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { boardApi } from '../api/board'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { useDialog } from '../contexts/DialogContext'
import Spinner from '../components/Spinner'
import type { BoardThread, BoardPost, BoardThreadCategory } from '../types'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open:     { label: '対応中',   className: 'bg-emerald-900/30 border border-emerald-700/40 text-emerald-300' },
  resolved: { label: '解決済み', className: 'bg-gray-800 border border-gray-700 text-gray-400' },
}

const CATEGORY_BADGE: Record<BoardThreadCategory, { label: string; className: string }> = {
  item_correction: { label: 'アイテム情報修正依頼', className: 'bg-blue-900/30 border border-blue-700/40 text-blue-300' },
  request:         { label: '要望',                 className: 'bg-teal-900/30 border border-teal-700/40 text-teal-300' },
  bug:             { label: '不具合',               className: 'bg-rose-900/30 border border-rose-700/40 text-rose-300' },
  other:           { label: 'その他',               className: 'bg-gray-800 border border-gray-700 text-gray-400' },
}

export default function BoardThreadPage() {
  const { id } = useParams()
  const threadId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { markBoardSeen, markBoardThreadSeen } = useNotification()
  const { confirm, alert } = useDialog()
  const isAdmin = user?.role === 'admin'

  const [thread, setThread] = useState<BoardThread | null>(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024

  const pickImage = (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください。', { title: 'エラー' })
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert('画像サイズは5MBまでです。', { title: 'エラー' })
      return
    }
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImage(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
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

  const load = () => {
    setLoading(true)
    boardApi.getThread(threadId)
      .then((r) => setThread(r.data))
      .catch(() => setThread(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(); markBoardSeen(); markBoardThreadSeen(threadId) }, [threadId])

  // 新着投稿のポーリング（5秒間隔）。
  // ローディング表示を出さず、投稿数・ステータスに変化があったときだけ反映する
  // （入力欄は別stateのため、更新で入力中テキストはリセットされない）。
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await boardApi.getThread(threadId)
        setThread((prev) => {
          if (!prev) return prev
          const next = res.data
          if (next.posts?.length === prev.posts?.length && next.status === prev.status) {
            return prev
          }
          return next
        })
        markBoardSeen()
        markBoardThreadSeen(threadId)
      } catch {
        // 通信エラーは無視して次回再試行
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.posts])

  const send = async () => {
    if ((!input.trim() && !image) || sending || !thread) return
    setSending(true)
    try {
      const res = await boardApi.postMessage(thread.id, input.trim(), image)
      setThread((prev) => prev ? { ...prev, posts: [...prev.posts, res.data] } : prev)
      setInput('')
      clearImage()
    } catch {
      await alert('投稿の送信に失敗しました。', { title: 'エラー' })
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

  const toggleVisibility = async () => {
    if (!thread) return
    const next = !thread.admin_only
    const res = await boardApi.updateVisibility(thread.id, next)
    setThread((prev) => prev ? { ...prev, admin_only: res.data.admin_only } : prev)
  }

  const handleDeleteThread = async () => {
    if (!thread) return
    if (!(await confirm('このスレッドを削除しますか？（投稿もすべて削除されます）', { title: 'スレッド削除', confirmLabel: '削除する', danger: true }))) return
    await boardApi.deleteThread(thread.id)
    navigate('/board')
  }

  const handleDeletePost = async (post: BoardPost) => {
    if (!thread) return
    if (!(await confirm('この投稿を削除しますか？', { title: '投稿削除', confirmLabel: '削除する', danger: true }))) return
    await boardApi.deletePost(post.id)
    setThread((prev) => prev ? { ...prev, posts: prev.posts.filter((p) => p.id !== post.id) } : prev)
  }

  // 自分の投稿の編集
  const [editingPostId, setEditingPostId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const startEditPost = (post: BoardPost) => {
    setEditingPostId(post.id)
    setEditDraft(post.message)
  }

  const editingPost = thread?.posts.find((p) => p.id === editingPostId) ?? null
  const canSaveEdit = !!editDraft.trim() || !!editingPost?.image_url

  const saveEditPost = async () => {
    if (editingPostId === null || !canSaveEdit || editSaving) return
    setEditSaving(true)
    try {
      const res = await boardApi.updatePost(editingPostId, editDraft.trim())
      setThread((prev) => prev
        ? { ...prev, posts: prev.posts.map((p) => p.id === editingPostId ? res.data : p) }
        : prev)
      setEditingPostId(null)
    } catch {
      await alert('投稿の編集に失敗しました。', { title: 'エラー' })
    } finally {
      setEditSaving(false)
    }
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
  const catBadge = CATEGORY_BADGE[thread.category] ?? CATEGORY_BADGE.other

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link to="/board" className="text-xs text-gray-400 hover:text-white transition-colors">‹ 運営掲示板へ戻る</Link>

      {/* スレッドヘッダー */}
      <div className="mt-2 mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${badge.className}`}>{badge.label}</span>
            <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${catBadge.className}`}>{catBadge.label}</span>
            {thread.admin_only && (
              <span className="text-xs rounded px-1.5 py-0.5 shrink-0 bg-purple-900/40 border border-purple-600/50 text-purple-200" title="管理者のみ閲覧可能">🔒 管理者限定</span>
            )}
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
              onClick={toggleVisibility}
              className="text-xs bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/40 text-purple-200 rounded px-2.5 py-1 transition-colors"
            >
              {thread.admin_only ? '全員に公開する' : '管理者限定にする'}
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

      {/* 公開範囲の注意（管理者限定 / 全員公開で出し分け） */}
      {thread.admin_only ? (
        <div className="mb-4 bg-purple-900/25 border border-purple-700/40 rounded-md px-3 py-2 text-xs text-purple-200 leading-relaxed">
          🔒 このスレッドは管理者のみが閲覧・投稿できます。一般ユーザーには表示されません。
        </div>
      ) : (
        <div className="mb-4 bg-yellow-900/30 border border-yellow-700/40 rounded-md px-3 py-2 text-xs text-yellow-200 leading-relaxed">
          ⚠ このスレッドの投稿は、ログイン中のすべてのユーザーが閲覧できます。個人情報は書き込まないでください。
        </div>
      )}

      {/* 投稿一覧（チャット） */}
      <div className="space-y-3">
        {thread.posts.map((post) => {
          const mine = isMine(post.user_id)
          return (
            <div key={post.id} className={`flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
              <p className="text-xs text-gray-500">{post.author_name}</p>
              {editingPostId === post.id ? (
                <div className="w-[80%] space-y-1.5">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    maxLength={5000}
                    rows={Math.min(Math.max(editDraft.split('\n').length, 2), 8)}
                    className="w-full bg-surface border border-primary-500/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 resize-none leading-relaxed"
                  />
                  {post.image_url && (
                    <img src={post.image_url} alt="添付画像" className="max-h-32 rounded-lg border border-surface-border" />
                  )}
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingPostId(null)}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={saveEditPost}
                      disabled={!canSaveEdit || editSaving}
                      className="text-xs bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors"
                    >
                      {editSaving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              ) : (
              <div className={`group relative max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words ${
                mine ? 'bg-primary-500 text-white rounded-tr-sm' : 'bg-surface-border text-gray-100 rounded-tl-sm'
              }`}>
                {post.message}
                {post.image_url && (
                  <a href={post.image_url} target="_blank" rel="noopener noreferrer" className={post.message ? 'block mt-2' : 'block'}>
                    <img
                      src={post.image_url}
                      alt="添付画像"
                      className="max-w-full max-h-80 rounded-lg border border-black/20"
                      loading="lazy"
                    />
                  </a>
                )}
                {(mine || isAdmin) && (
                  <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1">
                    {mine && (
                      <button
                        onClick={() => startEditPost(post)}
                        className="flex w-5 h-5 items-center justify-center rounded-full bg-gray-600 hover:bg-gray-500 text-white text-xs"
                        title="投稿を編集"
                      >
                        ✎
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleDeletePost(post)}
                        className="flex w-5 h-5 items-center justify-center rounded-full bg-red-600 text-white text-xs"
                        title="投稿を削除"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>
              )}
              <p className="text-xs text-gray-600">
                {new Date(post.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {post.updated_at && post.updated_at !== post.created_at && (
                  <span className="ml-1 text-gray-500">（編集済み）</span>
                )}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄（Enterで送信 / Shift+Enterで改行） */}
      <div className="mt-4">
        {/* 添付画像プレビュー */}
        {imagePreview && (
          <div className="mb-2 relative inline-block">
            <img src={imagePreview} alt="添付プレビュー" className="max-h-32 rounded-lg border border-surface-border" />
            <button
              onClick={clearImage}
              className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white text-xs"
              title="画像を取り消す"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="画像を添付"
            className="bg-surface hover:bg-surface-border border border-surface-border text-gray-300 rounded-full w-10 h-10 flex items-center justify-center shrink-0 transition-colors"
          >
            📎
          </button>
          <textarea
            placeholder="メッセージを入力...（Shift+Enterで改行）"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            onPaste={handlePaste}
            maxLength={5000}
            rows={Math.min(input.split('\n').length, 5)}
            className="flex-1 bg-surface border border-surface-border rounded-2xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none leading-relaxed"
          />
          <button
            onClick={send}
            disabled={(!input.trim() && !image) || sending}
            className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white rounded-full w-10 h-10 flex items-center justify-center shrink-0 transition-colors"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
