import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { USE_MOCK, mockChats, MOCK_MY_USER_ID } from '../api/mock'

interface NotificationContextValue {
  // チャットIDごとの未読フラグ
  unreadChatIds: Set<number>
  // 未読の出品IDセット（売り手として）
  unreadListingIds: Set<number>
  // 未読の買い手チャットがあるか
  hasBuyerUnread: boolean
  // チャットを既読にする
  markAsRead: (chatId: number) => void
  // ブラウザ通知の許可状態
  notifPermission: NotificationPermission
  // ブラウザ通知を有効化
  requestNotifPermission: () => Promise<void>
  // 全未読数
  totalUnread: number
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

// どのメッセージが「自分宛の未読」かを判定
function getUnreadChatIds(myUserId: number): Set<number> {
  const unread = new Set<number>()
  for (const chat of mockChats) {
    if (chat.status !== 'open') continue
    const lastMsg = chat.messages.at(-1)
    if (lastMsg && lastMsg.user_id !== myUserId) {
      unread.add(chat.id)
    }
  }
  return unread
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const myUserId = USE_MOCK ? MOCK_MY_USER_ID : null
  const [unreadChatIds, setUnreadChatIds] = useState<Set<number>>(new Set())
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const prevUnreadRef = useRef<Set<number>>(new Set())

  // ポーリングで未読チェック（5秒ごと）
  useEffect(() => {
    if (!myUserId) return

    const check = () => {
      const current = getUnreadChatIds(myUserId)
      setUnreadChatIds(new Set(current))

      // 新しく増えた未読があればブラウザ通知
      for (const id of current) {
        if (!prevUnreadRef.current.has(id) && Notification.permission === 'granted') {
          const chat = mockChats.find((c) => c.id === id)
          const lastMsg = chat?.messages.at(-1)
          if (lastMsg) {
            new Notification('MoE Trade — 新着メッセージ', {
              body: `${lastMsg.character_name}: ${lastMsg.message}`,
              icon: '/favicon.svg',
            })
          }
        }
      }
      prevUnreadRef.current = current
    }

    check()
    const timer = setInterval(check, 5000)
    return () => clearInterval(timer)
  }, [myUserId])

  const markAsRead = (chatId: number) => {
    setUnreadChatIds((prev) => {
      const next = new Set(prev)
      next.delete(chatId)
      return next
    })
  }

  // 未読がある出品ID（売り手として）
  const unreadListingIds = new Set(
    [...unreadChatIds].map((chatId) => {
      const chat = mockChats.find((c) => c.id === chatId)
      return chat?.listing_id
    }).filter((id): id is number => id !== undefined)
  )

  // 買い手として未読があるか
  const hasBuyerUnread = [...unreadChatIds].some((chatId) => {
    const chat = mockChats.find((c) => c.id === chatId)
    return chat?.buyer_id === myUserId
  })

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
      notifPermission,
      requestNotifPermission,
      totalUnread: unreadChatIds.size,
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
