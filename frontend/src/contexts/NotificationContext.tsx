import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import client from '../api/client'
import { useAuth } from './AuthContext'
import { USE_MOCK } from '../api/mock'

// /api/notifications/summary のレスポンス型
interface UnreadChat {
  chat_id: number
  listing_id: number
  buyer_id: number
  listing_user_id: number
  last_message_at: string
  last_message: string
  last_sender: string
}

interface BoardSummary {
  latest_post_at: string
  thread_id: number
  thread_title: string
}

interface BoardThreadUnread {
  thread_id: number
  latest_post_at: string
}

interface UnverifiedItems {
  equipment: number
  technique: number
  asset: number
  total: number
}

interface NotificationContextValue {
  // チャットIDごとの未読フラグ
  unreadChatIds: Set<number>
  // 未読の出品IDセット（売り手として）
  unreadListingIds: Set<number>
  // 未読の買い手チャットがあるか
  hasBuyerUnread: boolean
  // チャットを既読にする
  markAsRead: (chatId: number) => void
  // 運営掲示板に新着があるか
  hasNewBoard: boolean
  // 掲示板を既読にする
  markBoardSeen: () => void
  // 未読投稿のあるスレッドIDセット
  unreadBoardThreadIds: Set<number>
  // スレッドを既読にする
  markBoardThreadSeen: (threadId: number) => void
  // ブラウザ通知の許可状態
  notifPermission: NotificationPermission
  // ブラウザ通知を有効化
  requestNotifPermission: () => Promise<void>
  // 全未読数
  totalUnread: number
  // 未確認アイテム数（editor / admin のみ。それ以外は 0）
  unverifiedEquipmentCount: number
  unverifiedTechniqueCount: number
  unverifiedAssetCount: number
  unverifiedItemCount: number
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

// 既読管理（localStorage）
const CHAT_SEEN_KEY = 'notif_chat_seen'   // { [chatId]: lastSeenMessageAt }
const BOARD_SEEN_KEY = 'notif_board_seen' // lastSeenPostAt(ISO)
const BOARD_THREAD_SEEN_KEY = 'notif_board_thread_seen' // { [threadId]: lastSeenPostAt }

function loadChatSeen(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CHAT_SEEN_KEY) ?? '{}') } catch { return {} }
}
function saveChatSeen(map: Record<string, string>) {
  localStorage.setItem(CHAT_SEEN_KEY, JSON.stringify(map))
}

function loadBoardThreadSeen(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(BOARD_THREAD_SEEN_KEY) ?? '{}') } catch { return {} }
}
function saveBoardThreadSeen(map: Record<string, string>) {
  localStorage.setItem(BOARD_THREAD_SEEN_KEY, JSON.stringify(map))
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [unreadChats, setUnreadChats] = useState<UnreadChat[]>([])
  const [board, setBoard] = useState<BoardSummary | null>(null)
  const [boardThreads, setBoardThreads] = useState<BoardThreadUnread[]>([])
  const [unverifiedItems, setUnverifiedItems] = useState<UnverifiedItems | null>(null)
  // localStorage 更新を画面に反映させるためのバージョンカウンタ
  const [, setSeenVersion] = useState(0)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )
  // チャットID → 通知済みの最終メッセージ日時（同一チャットへの追加メッセージも検知する）
  const prevUnreadRef = useRef<Map<number, string>>(new Map())
  const prevBoardAtRef = useRef<string | null>(null)
  // 初回ポーリングではブラウザ通知しない（リロードのたびに既存未読を再通知しないため）
  const initializedRef = useRef(false)
  const summaryRef = useRef<UnreadChat[]>([])

  // 5秒ポーリング（ログイン時のみ）
  useEffect(() => {
    if (!user || USE_MOCK) return

    const check = async () => {
      try {
        const res = await client.get<{ unread_chats: UnreadChat[]; board: BoardSummary | null; board_threads?: BoardThreadUnread[]; unverified_items?: UnverifiedItems | null }>(
          '/notifications/summary'
        )
        const seen = loadChatSeen()
        const chats = res.data.unread_chats.filter(
          (c) => !seen[c.chat_id] || seen[c.chat_id] < c.last_message_at
        )
        setUnreadChats(chats)
        setBoard(res.data.board)
        setBoardThreads(res.data.board_threads ?? [])
        setUnverifiedItems(res.data.unverified_items ?? null)
        summaryRef.current = res.data.unread_chats

        // ブラウザ通知（初回ポーリングは通知せずベースラインのみ記録）
        if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          initializedRef.current
        ) {
          for (const c of chats) {
            const prevAt = prevUnreadRef.current.get(c.chat_id)
            // 新しく未読になったチャット、または既存未読への追加メッセージ
            if (!prevAt || prevAt < c.last_message_at) {
              new Notification('MoE Trade — 新着メッセージ', {
                body: `${c.last_sender}: ${c.last_message}`,
                icon: '/favicon.svg',
              })
            }
          }
          // 掲示板の新着（前回ポーリングより増えたときのみ）
          const boardSeen = localStorage.getItem(BOARD_SEEN_KEY) ?? ''
          const b = res.data.board
          if (
            b && b.latest_post_at > boardSeen &&
            prevBoardAtRef.current !== null && b.latest_post_at > prevBoardAtRef.current
          ) {
            new Notification('MoE Trade — 運営掲示板に新着', {
              body: b.thread_title,
              icon: '/favicon.svg',
            })
          }
        }
        prevUnreadRef.current = new Map(chats.map((c) => [c.chat_id, c.last_message_at]))
        prevBoardAtRef.current = res.data.board?.latest_post_at ?? ''
        initializedRef.current = true
      } catch {
        // 通信エラーは無視して次回再試行
      }
    }

    check()
    const timer = setInterval(check, 5000)
    return () => clearInterval(timer)
  }, [user])

  const markAsRead = (chatId: number) => {
    const target = summaryRef.current.find((c) => c.chat_id === chatId)
    const seen = loadChatSeen()
    seen[chatId] = target?.last_message_at ?? new Date().toISOString()
    saveChatSeen(seen)
    setUnreadChats((prev) => prev.filter((c) => c.chat_id !== chatId))
    setSeenVersion((v) => v + 1)
  }

  const markBoardSeen = () => {
    localStorage.setItem(BOARD_SEEN_KEY, board?.latest_post_at ?? new Date().toISOString())
    setSeenVersion((v) => v + 1)
  }

  const markBoardThreadSeen = (threadId: number) => {
    const latest = boardThreads.find((t) => t.thread_id === threadId)?.latest_post_at
    const seen = loadBoardThreadSeen()
    seen[threadId] = latest ?? new Date().toISOString()
    saveBoardThreadSeen(seen)
    setSeenVersion((v) => v + 1)
  }

  const unreadChatIds = new Set(unreadChats.map((c) => c.chat_id))
  const unreadListingIds = new Set(
    unreadChats.filter((c) => c.listing_user_id === user?.id).map((c) => c.listing_id)
  )
  const hasBuyerUnread = unreadChats.some((c) => c.buyer_id === user?.id)
  const boardSeenAt = localStorage.getItem(BOARD_SEEN_KEY) ?? ''
  const hasNewBoard = !!board && board.latest_post_at > boardSeenAt

  const boardThreadSeen = loadBoardThreadSeen()
  const unreadBoardThreadIds = new Set(
    boardThreads
      .filter((t) => !boardThreadSeen[t.thread_id] || boardThreadSeen[t.thread_id] < t.latest_post_at)
      .map((t) => t.thread_id)
  )

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setNotifPermission(result)
  }

  return (
    <NotificationContext.Provider value={{
      unreadChatIds,
      unreadListingIds,
      hasBuyerUnread,
      markAsRead,
      hasNewBoard,
      markBoardSeen,
      unreadBoardThreadIds,
      markBoardThreadSeen,
      notifPermission,
      requestNotifPermission,
      totalUnread: unreadChatIds.size,
      unverifiedEquipmentCount: unverifiedItems?.equipment ?? 0,
      unverifiedTechniqueCount: unverifiedItems?.technique ?? 0,
      unverifiedAssetCount: unverifiedItems?.asset ?? 0,
      unverifiedItemCount: unverifiedItems?.total ?? 0,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used inside NotificationProvider')
  return ctx
}
