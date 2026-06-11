import { useEffect, useRef, useState } from 'react'
import { chatApi } from '../api/chat'
import { useDialog } from '../contexts/DialogContext'
import type { TradeChat } from '../types'
import { SERVER_COLORS } from '../utils/constants'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open:        { label: '● 交渉中',     color: 'text-emerald-400' },
  deal:        { label: '✓ 取引成立',   color: 'text-primary-500' },
  declined:    { label: '✕ 見送り',     color: 'text-gray-500' },
  deal_failed: { label: '✕ 取引不成立', color: 'text-red-400' },
}

interface Props {
  chat: TradeChat
  currentUserId: number | null
  isOwner: boolean
  kind?: 'listing' | 'buy_request'
  // 取引対象（出品/買取）。取引方法（即決/交渉可）と価格の参照に使う。
  source?: { trade_type: string; price: number } | null
  // 取引成立時に呼ばれる（同じ出品の他チャットも更新するため）
  onDeal?: (updatedChats: TradeChat[]) => void
  onStatusChange?: (chat: TradeChat) => void
  // 出品の状態が変わり、出品一覧の再取得が必要なときに呼ばれる（取引不成立・再出品など）
  onListingsChanged?: () => void
  // 同じ取引対象に他の順番待ち（open チャット）が残っているか。
  // true の場合、取引不成立にすると次の取引希望に進む（再出品はしない）。
  hasWaitingNext?: boolean
}

export default function ChatThread({ chat: initialChat, currentUserId, isOwner, kind = 'listing', source, onDeal, onStatusChange, onListingsChanged, hasWaitingNext = false }: Props) {
  const { confirm } = useDialog()
  const [chat, setChat] = useState(initialChat)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  // 交渉可の取引成立で成立価格を入力するモーダル
  const [dealPriceOpen, setDealPriceOpen] = useState(false)
  const [dealPriceInput, setDealPriceInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setChat(initialChat) }, [initialChat])

  // 新着メッセージのポーリング（5秒間隔）。
  // 入力欄は別state（input）のため、チャット更新で入力中テキストはリセットされない。
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await chatApi.get(chat.id)
        setChat((prev) => {
          const next = res.data
          // 変化がなければ前のオブジェクトを返して不要な再描画を避ける
          if (
            next.messages?.length === prev.messages?.length &&
            next.status === prev.status &&
            next.seller_completed === prev.seller_completed &&
            next.buyer_completed === prev.buyer_completed
          ) {
            return prev
          }
          // buyer_character_name 等の付加情報はGETレスポンスに含まれないため引き継ぐ
          return {
            ...prev,
            ...next,
            buyer: next.buyer ?? prev.buyer,
            buyer_character_name: next.buyer_character_name ?? prev.buyer_character_name,
          }
        })
      } catch {
        // 通信エラーは無視して次回のポーリングで再試行
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [chat.id])

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

  // ステータス系API（deal / decline / reopen / complete 等）のレスポンスは
  // buyer・buyer_character_name・messages などのリレーションを含まないため、
  // 既存のチャット情報とマージして表示情報の欠落を防ぐ
  const mergeChat = (prev: TradeChat, next: Partial<TradeChat>): TradeChat => ({
    ...prev,
    ...next,
    buyer: next.buyer ?? prev.buyer,
    buyer_character_name: next.buyer_character_name ?? prev.buyer_character_name,
    messages: next.messages ?? prev.messages,
  })

  const handleMarkComplete = async () => {
    if (!(await confirm('受け渡しが完了しましたか？', { title: '取引完了の確認', confirmLabel: '完了にする' }))) return
    const res = await chatApi.markComplete(chat.id)
    const merged = mergeChat(chat, res.data)
    setChat(merged)
    onStatusChange?.(merged)
  }

  // 取引対象の取引方法・価格（propsのsource優先、なければchatに埋め込まれたlisting/buy_requestを参照）
  const sourceObj = source ?? ((chat as any).listing ?? (chat as any).buy_request) ?? null
  const isNegotiable = sourceObj?.trade_type === 'negotiable'

  const finalizeDeal = async (finalPrice?: number) => {
    const res = await chatApi.deal(chat.id, finalPrice)
    const updated = Array.isArray(res.data)
      ? res.data.find((c: any) => c.id === chat.id)!
      : res.data
    const merged = mergeChat(chat, updated)
    setChat(merged)
    onDeal?.(Array.isArray(res.data) ? res.data.map((c: any) => (c.id === chat.id ? merged : c)) : [merged])
    onStatusChange?.(merged)
  }

  const handleDeal = async () => {
    // 交渉可は成立価格を入力するモーダルを開く（初期値は登録価格）
    if (isNegotiable) {
      setDealPriceInput(sourceObj?.price != null ? String(sourceObj.price) : '')
      setDealPriceOpen(true)
      return
    }
    if (!(await confirm('取引成立にしますか？', { title: '取引成立の確認', confirmLabel: '取引成立にする' }))) return
    await finalizeDeal()
  }

  const confirmDealPrice = async () => {
    const price = Number(dealPriceInput)
    if (!Number.isInteger(price) || price < 1) return
    setDealPriceOpen(false)
    await finalizeDeal(price)
  }

  const handleDecline = async () => {
    if (!(await confirm('この取引希望を見送りにしますか？', { title: '見送りの確認', confirmLabel: '見送る', danger: true }))) return
    const res = await chatApi.decline(chat.id)
    const merged = mergeChat(chat, res.data)
    setChat(merged)
    onStatusChange?.(merged)
  }

  const handleDealFailed = async (relist: boolean) => {
    setShowDealFailedConfirm(false)
    const res = await chatApi.dealFailed(chat.id, relist)
    const merged = mergeChat(chat, res.data as Partial<TradeChat>)
    setChat(merged)
    onStatusChange?.(merged)
    // 出品が deal_failed になり、再出品時は新しい出品が作られるため一覧を再取得させる
    onListingsChanged?.()
  }

  const isMine = (userId: number) =>
    currentUserId !== null ? userId === currentUserId : userId === 99 || (!isOwner && userId !== 1)

  const status = STATUS_LABEL[chat.status] ?? STATUS_LABEL.open
  const isOpen = chat.status === 'open'
  const isDeal = chat.status === 'deal'
  const isDealFailed = chat.status === 'deal_failed'
  // 他ユーザーの取引が成立（取引対象がcompletedで自分のチャットはopen）
  const sourceStatus = ((chat as any).listing ?? (chat as any).buy_request)?.status
  const otherDealCompleted = isOpen && sourceStatus === 'completed'
  const canSend = (isOpen || isDeal) && !otherDealCompleted
  // 自分側の受け渡し完了済みかどうか
  const myCompleted = isDeal && (isOwner ? chat.seller_completed : chat.buyer_completed)
  const bothCompleted = isDeal && chat.seller_completed && chat.buyer_completed

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b border-surface-border shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">
              {isOwner
                ? chat.buyer_character_name
                : kind === 'buy_request' ? '買取登録者とのチャット' : '出品者とのチャット'}
            </p>
            <span className={`text-xs px-1.5 py-0.5 rounded ${SERVER_COLORS[chat.server]}`}>
              {chat.server}
            </span>
          </div>
          <span className={`text-xs ${status.color}`}>{status.label}</span>
        </div>

        <div className="flex flex-wrap gap-2">
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

      {/* 取引成立・見送り・不成立・他決定バナー */}
      {(isDeal || !isOpen || otherDealCompleted) && (
        <div className={`px-4 py-2 text-xs text-center border-b ${
          isDeal         ? 'bg-primary-500/10 text-primary-400 border-primary-500/20' :
          isDealFailed   ? 'bg-red-900/20 text-red-300 border-red-700/30' :
          otherDealCompleted ? 'bg-orange-900/20 text-orange-300 border-orange-700/30' :
                         'bg-surface-border/50 text-gray-500 border-surface-border'
        }`}>
          {isDeal && bothCompleted ? '✓✓ 双方の受け渡しが完了しました' :
           isDeal && myCompleted  ? `✓ 自分側の受け渡しが完了済み（相手側待ち）` :
           isDeal                 ? '✓ このチャットは取引成立しています（引き続きチャット可能です）' :
           isDealFailed       ? '✕ この取引は不成立になりました（編集できません）' :
           otherDealCompleted ? '⚠ 他のユーザーとの取引が成立しました' :
                          '✕ このチャットは見送りになりました'}
        </div>
      )}

      {/* 取引不成立確認ダイアログ */}
      {showDealFailedConfirm && (
        <div className="mx-4 my-2 p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-xs space-y-2">
          <p className="text-red-300 font-medium">取引不成立にしますか？</p>
          <p className="text-gray-400">取引成立後、長期間連絡が取れない等の理由がある時のみ不成立にしてください。</p>
          {hasWaitingNext ? (
            <>
              {/* 順番待ちが残っているので、次の取引希望に進む（再出品はしない） */}
              <p className="text-gray-300">不成立にすると、次の順番待ちの取引希望に進みます。</p>
              <div className="flex gap-2">
                <button onClick={() => handleDealFailed(false)} className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded transition-colors">不成立にして次の取引希望へ進む</button>
                <button onClick={() => setShowDealFailedConfirm(false)} className="text-xs text-gray-500 hover:text-white px-3 py-1.5 transition-colors">キャンセル</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-300">アイテムを再出品しますか？</p>
              <div className="flex gap-2">
                <button onClick={() => handleDealFailed(true)} className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded transition-colors">不成立にして再出品</button>
                <button onClick={() => handleDealFailed(false)} className="text-xs bg-surface hover:bg-surface-border border border-surface-border text-gray-300 px-3 py-1.5 rounded transition-colors">不成立のみ</button>
                <button onClick={() => setShowDealFailedConfirm(false)} className="text-xs text-gray-500 hover:text-white px-3 py-1.5 transition-colors">キャンセル</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 取引成立（交渉可）: 成立価格入力ダイアログ */}
      {dealPriceOpen && (
        <div className="mx-4 my-2 p-3 bg-primary-900/20 border border-primary-700/40 rounded-lg text-xs space-y-2">
          <p className="text-primary-300 font-medium">成立価格を入力してください</p>
          <p className="text-gray-400">交渉で決まった実際の取引価格を入力します。この価格が取引履歴（相場）に記録されます。</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={dealPriceInput}
              onChange={(e) => setDealPriceInput(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmDealPrice() }}
              placeholder="成立価格"
              className="w-32 bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white text-right placeholder-gray-600 focus:outline-none focus:border-primary-500"
            />
            <span className="text-gray-400">AC</span>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={confirmDealPrice}
              disabled={!(Number(dealPriceInput) >= 1)}
              className="text-xs bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors"
            >
              取引成立にする
            </button>
            <button onClick={() => setDealPriceOpen(false)} className="text-xs text-gray-500 hover:text-white px-3 py-1.5 transition-colors">キャンセル</button>
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
           isDealFailed ? 'この取引は不成立になりました（編集できません）' :
           chat.status === 'declined' ? 'このチャットは見送りになりました' : ''}
        </div>
      )}
    </div>
  )
}
