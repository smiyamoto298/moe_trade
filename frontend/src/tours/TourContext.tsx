import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { TourStep } from './types'
import { TOURS, pageIdForPath } from './content'

// localStorage キーの接頭辞
const SEEN_PREFIX = 'moe_tour_seen:'

function seenKey(pageId: string, version: number) {
  return `${SEEN_PREFIX}${pageId}:v${version}`
}

function hasSeen(pageId: string, version: number): boolean {
  try {
    return localStorage.getItem(seenKey(pageId, version)) === '1'
  } catch {
    return true // localStorage が使えない環境では自動表示しない
  }
}

function markSeen(pageId: string, version: number) {
  try {
    localStorage.setItem(seenKey(pageId, version), '1')
  } catch {
    /* noop */
  }
}

type TourContextValue = {
  // 表示中の状態（オーバーレイが参照）
  activePageId: string | null
  steps: TourStep[]
  index: number
  // 操作
  next: () => void
  prev: () => void
  stop: () => void
  // 起動
  startTour: (pageId: string) => boolean
  startCurrentPageTour: () => boolean
  hasTourForCurrentPath: boolean
  // 既読リセット（マイページのボタンなどから利用）
  resetAllTours: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour は TourProvider の内側で使ってください')
  return ctx
}

export function TourProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)

  const currentPageId = pageIdForPath(location.pathname)
  const hasTourForCurrentPath = !!(currentPageId && TOURS[currentPageId])

  const steps = activePageId && TOURS[activePageId] ? TOURS[activePageId].steps : []

  const startTour = useCallback((pageId: string): boolean => {
    const tour = TOURS[pageId]
    if (!tour || tour.steps.length === 0) return false
    setActivePageId(pageId)
    setIndex(0)
    return true
  }, [])

  const startCurrentPageTour = useCallback((): boolean => {
    if (!currentPageId) return false
    return startTour(currentPageId)
  }, [currentPageId, startTour])

  const stop = useCallback(() => {
    if (activePageId && TOURS[activePageId]) {
      markSeen(activePageId, TOURS[activePageId].version)
    }
    setActivePageId(null)
    setIndex(0)
  }, [activePageId])

  const next = useCallback(() => {
    setIndex((i) => {
      const total = activePageId && TOURS[activePageId] ? TOURS[activePageId].steps.length : 0
      if (i + 1 >= total) {
        // 最終ステップ → 終了
        if (activePageId && TOURS[activePageId]) markSeen(activePageId, TOURS[activePageId].version)
        setActivePageId(null)
        return 0
      }
      return i + 1
    })
  }, [activePageId])

  const prev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const resetAllTours = useCallback(() => {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(SEEN_PREFIX)) keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
    } catch {
      /* noop */
    }
  }, [])

  // ページ遷移時の初回自動表示
  const autoStartedRef = useRef<string | null>(null)
  useEffect(() => {
    // 別ページに移ったら表示中ツアーを閉じる
    setActivePageId(null)
    setIndex(0)

    if (!currentPageId) return
    const tour = TOURS[currentPageId]
    if (!tour) return
    if (hasSeen(tour.pageId, tour.version)) return
    if (autoStartedRef.current === location.pathname) return

    // DOM 描画を待ってから自動開始
    const t = setTimeout(() => {
      autoStartedRef.current = location.pathname
      setActivePageId(currentPageId)
      setIndex(0)
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const value: TourContextValue = {
    activePageId,
    steps,
    index,
    next,
    prev,
    stop,
    startTour,
    startCurrentPageTour,
    hasTourForCurrentPath,
    resetAllTours,
  }

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}
