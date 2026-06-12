// 本文（max-w-7xl = 1280px）の左右の余白に表示する公式サイトバナー。
// 左=01（幅120px）、右=02（幅160px）の固定割り当て。
// 表示閾値は「1280 + (バナー幅 + 左右の余白) × 2」から算出しており、
// 01のほうが狭いぶん先に表示される（1590〜1670pxでは左の1枚だけが出る）。
export default function SideBanners() {
  return (
    <>
      <a
        href="http://moepic.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden min-[1590px]:block fixed left-4 top-1/2 -translate-y-1/2 z-30"
      >
        <img src="/img/side_banner/moe_h_01.gif" alt="Master of Epic 公式サイト" width={120} height={600} />
      </a>
      <a
        href="http://moepic.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden min-[1670px]:block fixed right-4 top-1/2 -translate-y-1/2 z-30"
      >
        <img src="/img/side_banner/moe_h_02.gif" alt="Master of Epic 公式サイト" width={160} height={600} />
      </a>
    </>
  )
}
