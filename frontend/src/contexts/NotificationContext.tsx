import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import client from '../api/client'
import { useAuth } from './AuthContext'
import { USE_MOCK } from '../api/mock'
import { announcementsApi } from '../api/announcements'
import { subscribeWebPush, unsubscribeWebPush } from '../utils/webPush'
import type { Announcement } from '../types'

// /api/notifications/summary のレスポンス型
interface UnreadChat {
  chat_id: number
  source_type?: 'listing' | 'buy_request'
  listing_id: number | null
  buy_request_id?: number | null
  buyer_id: number
  listing_user_id: number | null
  buy_request_user_id?: number | null
  owner_id?: number | null
  last_message_at: string
  last_message: string
  last_sender: string
}

interface OutbidChat {
  chat_id: number
  source_type?: 'listing' | 'buy_request'
  listing_id?: number | null
  buy_request_id?: number | null
  item_name?: string | null
  your_bid?: number | null
  current_price?: number | null
  outbid_at: string
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
  other: number
  total: number
}

interface NotificationContextValue {
  // チャットIDごとの未読フラグ
  unreadChatIds: Set<number>
  // 未読の出品IDセット（売り手として）
  unreadListingIds: Set<number>
  // 未読の買取IDセット（買取登録者として）
  unreadBuyRequestIds: Set<number>
  // 未読の買い手チャットがあるか
  hasBuyerUnread: boolean
  // オークションで価格更新（outbid）された自分の入札チャット
  outbidChats: OutbidChat[]
  // 価格更新が未読のチャットIDセット
  unreadOutbidChatIds: Set<number>
  // 価格更新通知を既読にする
  markOutbidSeen: (chatId: number) => void
  // チャットを既読にする
  markAsRead: (chatId: number) => void
  // お問い合わせ（掲示板）に新着があるか
  hasNewBoard: boolean
  // 掲示板を既読にする
  markBoardSeen: () => void
  // 未読投稿のあるスレッドIDセット
  unreadBoardThreadIds: Set<number>
  // スレッドを既読にする
  markBoardThreadSeen: (threadId: number) => void
  // ブラウザ通知の許可状態
  notifPermission: NotificationPermission
  // ブラウザが通知API（Notification）に対応しているか。
  // 非対応（iPhone Safari 等）は notifPermission が 'denied' 固定になるため、
  // 「ブロックされている」のか「非対応（ホーム画面追加で利用可）」なのかをこれで区別する
  notifSupported: boolean
  // Web Push 購読済み（サイトを閉じていてもサーバープッシュが届く状態）か
  pushEnabled: boolean
  // ユーザーが通知をOFFにしているか（サイト側の設定。ブラウザ許可とは独立）
  pushOptedOut: boolean
  // 通知をOFFにする（Web Push購読を解除し、ページ内通知も止める）
  disablePush: () => Promise<void>
  // OFFにした通知をONに戻す（再購読）
  enablePush: () => Promise<void>
  // ブラウザ通知を有効化
  requestNotifPermission: () => Promise<void>
  // 全未読数
  totalUnread: number
  // 期限切れの自分の出品・買取の件数（再出品/再登録・取り下げを促す通知用）
  expiredCount: number
  // 未確認アイテム数（editor / admin のみ。それ以外は 0）
  unverifiedEquipmentCount: number
  unverifiedTechniqueCount: number
  unverifiedAssetCount: number
  unverifiedOtherCount: number
  unverifiedItemCount: number
  // 項目名の管理: 未整理の付加効果ラベル件数（editor / admin のみ。それ以外は 0）
  unorganizedLabelCount: number
  // 除外アイテム管理: ユーザー個別除外の昇格候補件数（admin のみ。それ以外は 0）
  excludedSuggestionCount: number
  // お知らせ（管理者がDBで設定。通知と同じ5秒間隔で更新）
  announcements: Announcement[]
  // 指定ユーザー向けお知らせを既読にする（サーバー側で対象から外れ、0人で削除）
  markAnnouncementRead: (id: number) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

// 既読管理（localStorage）
const CHAT_SEEN_KEY = 'notif_chat_seen'   // { [chatId]: lastSeenMessageAt }
const BOARD_SEEN_KEY = 'notif_board_seen' // lastSeenPostAt(ISO)
const BOARD_THREAD_SEEN_KEY = 'notif_board_thread_seen' // { [threadId]: lastSeenPostAt }
const OUTBID_SEEN_KEY = 'notif_outbid_seen' // { [chatId]: lastSeenOutbidAt }
const PUSH_OPT_OUT_KEY = 'push_opt_out'     // '1' = ユーザーが通知をOFFにした（再購読もページ内通知も抑制）

function loadOutbidSeen(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(OUTBID_SEEN_KEY) ?? '{}') } catch { return {} }
}
function saveOutbidSeen(map: Record<string, string>) {
  localStorage.setItem(OUTBID_SEEN_KEY, JSON.stringify(map))
}

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
  const [outbidChats, setOutbidChats] = useState<OutbidChat[]>([])
  const [board, setBoard] = useState<BoardSummary | null>(null)
  const [boardThreads, setBoardThreads] = useState<BoardThreadUnread[]>([])
  const [unverifiedItems, setUnverifiedItems] = useState<UnverifiedItems | null>(null)
  const [unorganizedLabelCount, setUnorganizedLabelCount] = useState(0)
  const [excludedSuggestionCount, setExcludedSuggestionCount] = useState(0)
  const [expiredCount, setExpiredCount] = useState(0)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
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
  // Web Push 購読済みかどうか。購読済みならチャットの新着はサーバープッシュ（Service Worker）
  // 側で通知されるため、ポーリング由来のページ内 Notification は出さない（二重通知の防止）。
  // ref はポーリングのクロージャから最新値を参照するため（state は UI 表示用）。
  const pushEnabledRef = useRef(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const markPushEnabled = (ok: boolean) => {
    pushEnabledRef.current = ok
    setPushEnabled(ok)
  }
  // 通知OFF（ユーザーのオプトアウト）。ブラウザ許可とは独立したサイト側の設定で、
  // ON にするまで自動再購読・ページ内通知の両方を抑制する
  const [pushOptedOut, setPushOptedOut] = useState(() => localStorage.getItem(PUSH_OPT_OUT_KEY) === '1')
  const pushOptedOutRef = useRef(pushOptedOut)
  const markPushOptedOut = (optedOut: boolean) => {
    if (optedOut) localStorage.setItem(PUSH_OPT_OUT_KEY, '1')
    else localStorage.removeItem(PUSH_OPT_OUT_KEY)
    pushOptedOutRef.current = optedOut
    setPushOptedOut(optedOut)
  }

  // Web Push の自動再購読（通知許可済みのブラウザで、ログイン時に購読をサーバーへ最新化する）。
  // 旧ブラウザ通知の時代に許可済みだったユーザーも、この自動購読で操作なしにプッシュ配信へ移行する。
  // ユーザーが通知をOFFにしている間は再購読しない
  useEffect(() => {
    if (!user || USE_MOCK) return
    if (localStorage.getItem(PUSH_OPT_OUT_KEY) === '1') return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    subscribeWebPush().then(markPushEnabled).catch(() => {})
  }, [user])

  // 通知をOFFにする：購読を解除し（サーバー行削除＋ブラウザ購読解除）、以後の再購読・ページ内通知を止める
  const disablePush = async () => {
    markPushOptedOut(true)
    markPushEnabled(false)
    await unsubscribeWebPush()
  }

  // OFFにした通知をONに戻す：オプトアウトを解除して再購読する（未許可なら許可リクエストから）
  const enablePush = async () => {
    markPushOptedOut(false)
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted') {
      markPushEnabled(await subscribeWebPush())
    } else {
      await requestNotifPermission()
    }
  }

  // お知らせのポーリング（5秒間隔・ログイン有無に関わらず）
  useEffect(() => {
    if (USE_MOCK) return
    const loadAnnouncements = () => {
      announcementsApi.list().then((r) => setAnnouncements(r.data)).catch(() => {})
    }
    loadAnnouncements()
    const timer = setInterval(loadAnnouncements, 5000)
    return () => clearInterval(timer)
  }, [])

  // 5秒ポーリング（ログイン時のみ）
  useEffect(() => {
    if (!user || USE_MOCK) return

    const check = async () => {
      try {
        const res = await client.get<{ unread_chats: UnreadChat[]; outbid_chats?: OutbidChat[]; board: BoardSummary | null; board_threads?: BoardThreadUnread[]; unverified_items?: UnverifiedItems | null; unorganized_label_count?: number; excluded_suggestion_count?: number; expired_count?: number }>(
          '/notifications/summary'
        )
        const seen = loadChatSeen()
        const chats = res.data.unread_chats.filter(
          (c) => !seen[c.chat_id] || seen[c.chat_id] < c.last_message_at
        )
        setUnreadChats(chats)
        setOutbidChats(res.data.outbid_chats ?? [])
        setBoard(res.data.board)
        setBoardThreads(res.data.board_threads ?? [])
        setUnverifiedItems(res.data.unverified_items ?? null)
        setUnorganizedLabelCount(res.data.unorganized_label_count ?? 0)
        setExcludedSuggestionCount(res.data.excluded_suggestion_count ?? 0)
        setExpiredCount(res.data.expired_count ?? 0)
        summaryRef.current = res.data.unread_chats

        // ブラウザ通知（初回ポーリングは通知せずベースラインのみ記録）。
        // ユーザーが通知をOFFにしている間はページ内通知も出さない
        if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          !pushOptedOutRef.current &&
          initializedRef.current
        ) {
          // Web Push 購読済みならチャットの新着はサーバープッシュで届くため、ここでは通知しない
          if (!pushEnabledRef.current) {
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
          }
          // 掲示板の新着（前回ポーリングより増えたときのみ）
          const boardSeen = localStorage.getItem(BOARD_SEEN_KEY) ?? ''
          const b = res.data.board
          if (
            b && b.latest_post_at > boardSeen &&
            prevBoardAtRef.current !== null && b.latest_post_at > prevBoardAtRef.current
          ) {
            new Notification('MoE Trade — お問い合わせに新着', {
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

  const markOutbidSeen = (chatId: number) => {
    const latest = outbidChats.find((c) => c.chat_id === chatId)?.outbid_at
    const seen = loadOutbidSeen()
    seen[chatId] = latest ?? new Date().toISOString()
    saveOutbidSeen(seen)
    setSeenVersion((v) => v + 1)
  }

  // 指定ユーザー向けお知らせを既読にする。楽観的に画面から消し、サーバーへ反映する。
  const markAnnouncementRead = (id: number) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id))
    announcementsApi.markRead(id).catch(() => {})
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
    unreadChats
      .filter((c) => c.listing_user_id === user?.id && c.listing_id != null)
      .map((c) => c.listing_id as number)
  )
  const unreadBuyRequestIds = new Set(
    unreadChats
      .filter((c) => c.buy_request_user_id === user?.id && c.buy_request_id != null)
      .map((c) => c.buy_request_id as number)
  )
  const hasBuyerUnread = unreadChats.some((c) => c.buyer_id === user?.id)
  const outbidSeen = loadOutbidSeen()
  const unreadOutbidChatIds = new Set(
    outbidChats
      .filter((c) => !outbidSeen[c.chat_id] || outbidSeen[c.chat_id] < c.outbid_at)
      .map((c) => c.chat_id)
  )
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
    // 許可されたら Web Push も購読し、サイトを閉じていても通知が届くようにする
    // （明示的な有効化操作なので、OFF設定が残っていれば解除する）
    if (result === 'granted') {
      markPushOptedOut(false)
      markPushEnabled(await subscribeWebPush())
    }
  }

  return (
    <NotificationContext.Provider value={{
      unreadChatIds,
      unreadListingIds,
      unreadBuyRequestIds,
      hasBuyerUnread,
      outbidChats,
      unreadOutbidChatIds,
      markOutbidSeen,
      markAsRead,
      hasNewBoard,
      markBoardSeen,
      unreadBoardThreadIds,
      markBoardThreadSeen,
      notifPermission,
      notifSupported: typeof Notification !== 'undefined',
      pushEnabled,
      pushOptedOut,
      disablePush,
      enablePush,
      requestNotifPermission,
      totalUnread: unreadChatIds.size + unreadOutbidChatIds.size,
      expiredCount,
      unverifiedEquipmentCount: unverifiedItems?.equipment ?? 0,
      unverifiedTechniqueCount: unverifiedItems?.technique ?? 0,
      unverifiedAssetCount: unverifiedItems?.asset ?? 0,
      unverifiedOtherCount: unverifiedItems?.other ?? 0,
      unverifiedItemCount: unverifiedItems?.total ?? 0,
      unorganizedLabelCount,
      excludedSuggestionCount,
      announcements,
      markAnnouncementRead,
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
