import { useEffect, useRef, useState } from 'react'
import { chatApi } from '../api/chat'
import type { TradeChat } from '../types'
import { SERVER_COLORS } from '../utils/constants'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open:     { label: '● 交渉中',   color: 'text-emerald-400' },
  deal:     { label: '✓ 取引成立', color: 'text-primary-500' },
  declined: { label: '✕ 見送り',   color: 'text-gray-500' },
}

interface Props {
  chat: TradeChat
  currentUserId: number | null
  isOwner: boolean
  // 取引成立時に呼ばれる（同じ出品の他チャットも更新するため）
  onDeal?: (updatedChats: TradeChat[]) => void
  onStatusChange?: (chat: TradeChat) => void
}

export default function ChatThread({ chat: initialChat, currentUserId, isOwner, onDeal, onStatusChange }: Props) {
  const [chat, setChat] = useState(initialChat)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setChat(initialChat) }, [initialChat])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages])

  const send = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await chatApi.sendMessage(chat.id, input.trim())
      // APIはメッセージ単体を返すので、既存メッセージに追記する
      setChat((prev) => ({
        ...prev,
        messages: [...prev.messages, res.data as any],
      }))
      setInput('')
    } finally {
      setSending(false)
    }
  }

  const [showDealFailedConfirm, setShowDealFailedConfirm] = useState(false)

  const handleMarkComplete = async () => {
    if (!confirm('受け渡しが完了しましたか？')) return
    const res = await chatApi.markComplete(chat.id)
    setChat(res.data)
    onStatusChange?.(res.data)
  }

  const handleDeal = async () => {
    if (!confirm('取引成立にしますか？')) return
    const res = await chatApi.deal(chat.id)
    const updated = Array.isArray(res.data)
      ? res.data.find((c: any) => c.id === chat.id)!
      : res.data
    setChat(updated)
    onDeal?.(Array.isArray(res.data) ? res.data : [updated])
    onStatusChange?.(updated)
  }

  const handleDecline = async () => {
    if (!confirm('この取引希望を見送りにしますか？')) return
    const res = await chatApi.decline(chat.id)
    setChat(res.data)
    onStatusChange?.(res.data)
  }

  const handleDealFailed = async (relist: boolean) => {
    setShowDealFailedConfirm(false)
    const res = await chatApi.dealFailed(chat.id, relist)
    const updated = (res.data as any)
    setChat(updated)
    onStatusChange?.(updated)
  }

  const isMine = (userId: number) =>
    currentUserId !== null ? userId === currentUserId : userId === 99 || (!isOwner && userId !== 1)

  const status = STATUS_LABEL[chat.status] ?? STATUS_LABEL.open
  const isOpen = chat.status === 'open'
  const isDeal = chat.status === 'deal'
  // 他ユーザーの取引が成立（この出品がcompletedで自分のチャットはopen）
  const otherDealCompleted = isOpen && (chat as any).listing?.status === 'completed'
  const canSend = (isOpen || isDeal) && !otherDealCompleted
  // 自分側の受け渡し完了済みかどうか
  const myCompleted = isDeal && (isOwner ? chat.seller_completed : chat.buyer_completed)
  const bothCompleted = isDeal && chat.seller_completed && chat.buyer_completed

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">
              {isOwner ? chat.buyer_character_name : '出品者とのチャット'}
            </p>
            <span className={`text-xs px-1.5 py-0.5 rounded ${SERVER_COLORS[chat.server]}`}>
              {chat.server}
            </span>
          </div>
          <span className={`text-xs ${status.color}`}>{status.label}</span>
        </div>

        <div className="flex gap-2">
          {/* 出品者のみ */}
          {isOwner && isOpen && !otherDealCompleted && (
            <>
              <button onClick={handleDeal} className="text-xs bg-primary-500/20 hover:bg-primary-500/40 border border-primary-500/50 text-primary-400 rounded px-2.5 py-1 transition-colors">
                取引成立
              </button>
              <button onClick={handleDecline} className="text-xs bg-surface hover:bg-surface-border border border-surface-border text-gray-400 rounded px-2.5 py-1 transition-colors">
                見送り
              </button>
            </>
          )}
          {/* 出品者・取引希望者共通 */}
          {isDeal && !myCompleted && (
            <button onClick={handleMarkComplete} className="text-xs bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700/50 text-emerald-300 rounded px-2.5 py-1 transition-colors">
              受け渡し完了
            </button>
          )}
          {isDeal && isOwner && (
            <button onClick={() => setShowDealFailedConfirm(true)} className="text-xs bg-surface hover:bg-surface-border border border-surface-border text-gray-300 rounded px-2.5 py-1 transition-colors">
              取引不成立
            </button>
          )}
        </div>
      </div>

      {/* 取引成立・見送り・他決定バナー */}
      {(isDeal || !isOpen || otherDealCompleted) && (
        <div className={`px-4 py-2 text-xs text-center border-b ${
          isDeal         ? 'bg-primary-500/10 text-primary-400 border-primary-500/20' :
          otherDealCompleted ? 'bg-orange-900/20 text-orange-300 border-orange-700/30' :
                         'bg-surface-border/50 text-gray-500 border-surface-border'
        }`}>
          {isDeal && bothCompleted ? '✓✓ 双方の受け渡しが完了しました' :
           isDeal && myCompleted  ? `✓ 自分側の受け渡しが完了済み（相手側待ち）` :
           isDeal                 ? '✓ このチャットは取引成立しています（引き続きチャット可能です）' :
           otherDealCompleted ? '⚠ 他のユーザーとの取引が成立しました' :
                          '✕ このチャットは見送りになりました'}
        </div>
      )}

      {/* 取引不成立確認ダイアログ */}
      {showDealFailedConfirm && (
        <div className="mx-4 my-2 p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-xs space-y-2">
          <p className="text-red-300 font-medium">取引不成立にしますか？</p>
          <p className="text-gray-400">取引成立後、長期間連絡が取れない等の理由がある時のみ不成立にしてください。</p>
          <p className="text-gray-300">アイテムを再出品しますか？</p>
          <div className="flex gap-2">
            <button onClick={() => handleDealFailed(true)} className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded transition-colors">不成立にして再出品</button>
            <button onClick={() => handleDealFailed(false)} className="text-xs bg-surface hover:bg-surface-border border border-surface-border text-gray-300 px-3 py-1.5 rounded transition-colors">不成立のみ</button>
            <button onClick={() => setShowDealFailedConfirm(false)} className="text-xs text-gray-500 hover:text-white px-3 py-1.5 transition-colors">キャンセル</button>
          </div>
        </div>
      )}

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {(chat.messages?.length ?? 0) === 0 && (
          <p className="text-center text-sm text-gray-500 py-8">
            まだメッセージはありません。取引希望のメッセージを送ってください。
          </p>
        )}
        {(chat.messages ?? []).map((msg) => {
          const mine = isMine(msg.user_id)
          return (
            <div key={msg.id} className={`flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
              <p className="text-xs text-gray-500">{msg.character_name}</p>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                mine
                  ? 'bg-primary-500 text-white rounded-tr-sm'
                  : 'bg-surface-border text-gray-100 rounded-tl-sm'
              }`}>
                {msg.message}
              </div>
              <p className="text-xs text-gray-600">
                {new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄 */}
      {canSend ? (
        <div className="px-4 py-3 border-t border-surface-border flex gap-2 shrink-0">
          <input
            type="text"
            placeholder="メッセージを入力..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
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
      ) : (
        <div className="px-4 py-3 border-t border-surface-border text-center text-xs text-gray-500 shrink-0">
          {otherDealCompleted ? '他のユーザーの取引が成立したためメッセージを送れません' :
           chat.status === 'declined' ? 'このチャットは見送りになりました' : ''}
        </div>
      )}
    </div>
  )
}
