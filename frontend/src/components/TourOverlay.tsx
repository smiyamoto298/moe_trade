import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTour } from '../tours/TourContext'
import type { TourStep } from '../tours/types'

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8 // ハイライト枠の余白
const GAP = 10 // 対象と吹き出しの隙間
const MARGIN = 12 // 画面端の余白
const TOOLTIP_W = 320

/**
 * 要素が実際に描画されているか。
 * DOM に存在しても、スマホ幅の CSS（display:none やコンテナクエリの列隠し）で
 * 非表示になっている要素はハイライトできないため false を返す。
 */
function isElementVisible(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false // display:none・非描画
  if (window.getComputedStyle(el).visibility === 'hidden') return false
  const r = el.getBoundingClientRect()
  return r.width > 0 || r.height > 0
}

/** そのステップが現在の画面で表示できるか（target 無し＝中央カードは常に表示可能） */
function isStepDisplayable(s: TourStep): boolean {
  if (!s.target) return true
  const el = document.querySelector(s.target) as HTMLElement | null
  return !!el && isElementVisible(el)
}

export default function TourOverlay() {
  const { activePageId, steps, index, next, prev, stop } = useTour()
  const [rect, setRect] = useState<Rect | null>(null)
  const [tooltipH, setTooltipH] = useState(0)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const active = !!activePageId && steps.length > 0
  const step = active ? steps[index] : undefined

  // カウンター表示は「現在の画面で表示できるステップ」だけで数える
  // （スマホ幅で隠れる要素のステップは番号・総数に含めない）
  const { displayPos, displayTotal } = useMemo(() => {
    if (!active) return { displayPos: 0, displayTotal: 0 }
    let pos = 0
    let total = 0
    steps.forEach((s, i) => {
      if (!isStepDisplayable(s)) return
      total++
      if (i <= index) pos++
    })
    return { displayPos: Math.max(1, pos), displayTotal: Math.max(1, total) }
  }, [active, steps, index])

  const isLast = active && displayPos >= displayTotal

  // 対象要素の位置を毎フレーム追従（スクロール・リサイズに自動対応）
  useLayoutEffect(() => {
    if (!active || !step) return

    let cancelled = false

    const measure = () => {
      if (cancelled) return
      if (step.target) {
        const el = document.querySelector(step.target) as HTMLElement | null
        if (el && isElementVisible(el)) {
          const r = el.getBoundingClientRect()
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        } else {
          setRect(null)
        }
      } else {
        setRect(null) // 中央カード表示
      }
      rafRef.current = requestAnimationFrame(measure)
    }

    // 対象が画面外なら中央へスクロール
    if (step.target) {
      const el = document.querySelector(step.target) as HTMLElement | null
      if (el && isElementVisible(el)) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    measure()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [active, step, index])

  // 吹き出しの実寸（高さ）を測定して、はみ出さない位置計算に使う
  useLayoutEffect(() => {
    if (!active) return
    const h = tooltipRef.current?.offsetHeight ?? 0
    if (h && h !== tooltipH) setTooltipH(h)
  })

  // 対象セレクタが指定されているのに要素が見つからない／表示されていないステップは自動スキップ。
  // 「戻る」で来た場合は前方向へ飛ばす（先頭まで来たら前進に切り替え）。
  const prevIndexRef = useRef(0)
  useEffect(() => {
    if (!active) return
    const goingBack = index < prevIndexRef.current
    prevIndexRef.current = index
    if (!step?.target) return

    const skip = () => {
      if (goingBack && index > 0) prev()
      else next()
    }
    const el = document.querySelector(step.target) as HTMLElement | null
    if (el && !isElementVisible(el)) {
      // DOM にあるが CSS で非表示（スマホ幅で隠れる列など）→ 即スキップ
      skip()
      return
    }
    // 存在しない場合は描画途中の可能性があるため少し待ってから判定
    const t = setTimeout(() => {
      const cur = document.querySelector(step.target!) as HTMLElement | null
      if (!cur || !isElementVisible(cur)) skip()
    }, 900)
    return () => clearTimeout(t)
  }, [active, step, index, next, prev])

  // ESC で終了
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, stop])

  if (!active || !step) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = step.width ?? TOOLTIP_W // 吹き出し幅（ステップごとに指定可・既定320）

  // 吹き出しの位置を決める（必ず画面内に収まるようにクランプ）
  let tooltipStyle: React.CSSProperties
  if (rect) {
    const spaceBelow = vh - (rect.top + rect.height) - GAP - MARGIN
    const spaceAbove = rect.top - GAP - MARGIN

    // 配置面の決定：指定があっても入りきらなければ自動で反対側へ
    let placeBelow: boolean
    if (step.placement === 'bottom') {
      placeBelow = spaceBelow >= tooltipH || spaceBelow >= spaceAbove
    } else if (step.placement === 'top') {
      placeBelow = !(spaceAbove >= tooltipH || spaceAbove >= spaceBelow)
    } else {
      placeBelow = spaceBelow >= tooltipH ? true : spaceBelow >= spaceAbove
    }

    let top = placeBelow
      ? rect.top + rect.height + PAD + GAP
      : rect.top - PAD - GAP - tooltipH
    // 画面の上下にはみ出さないようクランプ
    top = Math.max(MARGIN, Math.min(top, vh - tooltipH - MARGIN))

    let left = rect.left + rect.width / 2 - w / 2
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN))

    tooltipStyle = {
      position: 'fixed',
      top,
      left,
      width: w,
      maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
      maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
      overflowY: 'auto',
    }
  } else {
    // 中央表示
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: w,
      maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
      maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
      overflowY: 'auto',
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      {/* クリックブロッカー（背面操作を防ぐ）。rect が無いときは暗幕も兼ねる */}
      <div
        className={`absolute inset-0 pointer-events-auto ${rect ? '' : 'bg-black/60'}`}
        onClick={(e) => e.stopPropagation()}
      />

      {/* スポットライト（対象をくり抜いて周囲を暗くする） */}
      {rect && (
        <div
          className="absolute rounded-lg pointer-events-none transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
            outline: '2px solid rgba(99,102,241,0.9)',
          }}
        />
      )}

      {/* 吹き出し */}
      <div
        ref={tooltipRef}
        className="pointer-events-auto bg-surface-card border border-surface-border rounded-xl shadow-2xl p-4"
        style={tooltipStyle}
      >
        <button
          onClick={stop}
          className="absolute top-2.5 right-3 text-gray-500 hover:text-white transition-colors text-sm"
          aria-label="閉じる"
        >
          ✕
        </button>
        <h3 className="text-sm font-bold text-white pr-6 mb-1.5">{step.title}</h3>
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{step.body}</p>

        {step.image && (
          <img
            src={step.image}
            alt={step.imageAlt ?? ''}
            className="mt-3 w-full rounded-lg border border-surface-border"
          />
        )}

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-500">
            {displayPos} / {displayTotal}
          </span>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                onClick={prev}
                className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-md border border-surface-border transition-colors"
              >
                戻る
              </button>
            )}
            <button
              onClick={next}
              className="text-xs bg-primary-500 hover:bg-primary-600 text-white px-4 py-1.5 rounded-md transition-colors"
            >
              {isLast ? '完了' : '次へ'}
            </button>
          </div>
        </div>
        {!isLast && (
          <button
            onClick={stop}
            className="block w-full text-center text-[11px] text-gray-500 hover:text-gray-300 mt-2 transition-colors"
          >
            案内をスキップ
          </button>
        )}
      </div>
    </div>
  )
}
