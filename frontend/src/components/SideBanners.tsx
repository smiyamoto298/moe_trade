import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

// 本文の左右の余白に表示する公式サイトバナー。左=01（幅120px）、右=02（幅160px）。
// 本文幅はページごとに異なる（max-w-sm 〜 max-w-7xl）ため、固定の画面幅閾値ではなく
// main 内の本文コンテナ（max-w-* 要素）の左右余白を実測して表示可否を判定する。
// 必要余白 = バナー幅 + 35px（画面端からの 16px ＋ 本文との間隔）。
// max-w-7xl のページでは従来の閾値（左 1590px / 右 1670px）と同じ挙動になる。
const LEFT_REQUIRED = 120 + 35
const RIGHT_REQUIRED = 160 + 35

function measureGaps(): { left: boolean; right: boolean } {
  const content = document.querySelector('main [class*="max-w-"]')
  if (!content) return { left: false, right: false }
  const rect = content.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth
  return {
    left: rect.left >= LEFT_REQUIRED,
    right: viewportWidth - rect.right >= RIGHT_REQUIRED,
  }
}

export default function SideBanners() {
  const location = useLocation()
  const [show, setShow] = useState({ left: false, right: false })

  useEffect(() => {
    const update = () => setShow(measureGaps())
    update()
    window.addEventListener('resize', update)
    // 遅延読み込みルートやデータ取得で本文のレイアウトが後から変わるため、
    // main のサイズ変化でも再判定する
    const main = document.querySelector('main')
    const observer = main ? new ResizeObserver(update) : null
    if (main && observer) observer.observe(main)
    return () => {
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [location.pathname])

  return (
    <>
      {show.left && (
        <a
          href="https://moepic.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed left-4 top-1/2 -translate-y-1/2 z-30"
        >
          <img src="/img/side_banner/moe_h_01.gif" alt="Master of Epic 公式サイト" width={120} height={600} />
        </a>
      )}
      {show.right && (
        <a
          href="https://moepic.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed right-4 top-1/2 -translate-y-1/2 z-30"
        >
          <img src="/img/side_banner/moe_h_02.gif" alt="Master of Epic 公式サイト" width={160} height={600} />
        </a>
      )}
    </>
  )
}
