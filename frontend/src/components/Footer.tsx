import { useState } from 'react'
import { Link } from 'react-router-dom'

const FOOTER_BANNERS = [
  '/img/banner/moe_s_01.gif',
  '/img/banner/moe_s_02.gif',
  '/img/banner/moe_s_03.gif',
  '/img/banner/moe_s_04.gif',
  '/img/banner/moe_s_05.gif',
]

export default function Footer() {
  // マウント時にランダムなバナーを1つ選ぶ
  const [bannerSrc] = useState(
    () => FOOTER_BANNERS[Math.floor(Math.random() * FOOTER_BANNERS.length)]
  )

  return (
    <footer className="fixed bottom-0 inset-x-0 z-40 border-t border-surface-border bg-surface">
      {/* md以上: 右端にバナーを置き、著作権表記は残り幅の中で中央寄せ。md未満: バナー非表示 */}
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-4">
        <div className="flex-1 text-center space-y-1">
          <p className="text-xs text-gray-400">
            (C)MOE K.K. (C)Konami Digital Entertainment 株式会社MOE及び株式会社コナミデジタルエンタテインメントの著作権を侵害する行為は禁止されています。
          </p>
          <p className="text-xs text-gray-600 space-x-3">
            <a
              href="http://moepic.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 underline"
            >
              Master of Epic 公式サイト
            </a>
            <Link to="/terms" className="hover:text-gray-400 underline">
              利用規約
            </Link>
            <Link to="/privacy" className="hover:text-gray-400 underline">
              プライバシーポリシー
            </Link>
          </p>
        </div>
        <a
          href="http://moepic.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:block shrink-0"
        >
          <img src={bannerSrc} alt="Master of Epic 公式サイト" width={200} height={40} />
        </a>
      </div>
    </footer>
  )
}
