import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import VerifyEmailBanner from './VerifyEmailBanner'

export default function Header() {
  const { user, logout } = useAuth()
  const { totalUnread, hasNewBoard, unverifiedItemCount, unorganizedLabelCount, excludedSuggestionCount, announcements } = useNotification()
  // 管理メニュー配下の通知合計（ドロップダウンを閉じていても気づけるよう「管理」にドット表示）
  const adminNotifCount = unorganizedLabelCount + excludedSuggestionCount
  const navigate = useNavigate()
  const [adminOpen, setAdminOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const adminRef = useRef<HTMLDivElement>(null)

  // ユーザーが「表示しない」にしたお知らせ（端末ごとに localStorage で保持）。
  // 内容が更新された場合は再表示するため、id と updated_at を組にしてキーにする。
  const DISMISSED_KEY = 'dismissedAnnouncements'
  const announcementKey = (a: { id: number; updated_at: string }) => `${a.id}:${a.updated_at}`
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY)
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set<string>()
    }
  })
  const dismissAnnouncement = (a: { id: number; updated_at: string }) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(announcementKey(a))
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
      } catch {
        /* localStorage 不可の環境では非表示はセッション内のみ有効 */
      }
      return next
    })
  }
  const visibleAnnouncements = announcements.filter((a) => !dismissed.has(announcementKey(a)))

  // 画面遷移時にモバイルメニューを閉じる
  const closeMobile = () => setMobileOpen(false)

  // モバイルメニューを開いている間は背面のスクロールを止める
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  // 管理ドロップダウンの外側をクリックしたら閉じる
  useEffect(() => {
    if (!adminOpen) return
    const handleOutside = (e: MouseEvent) => {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [adminOpen])

  const handleLogout = async () => {
    setMobileOpen(false)
    await logout()
    navigate('/auth/login')
  }

  // デスクトップ・モバイル共通で使うナビリンク群
  const navLinks = (
    <>
      <Link
        to="/all"
        onClick={closeMobile}
        className="text-gray-300 hover:text-white transition-colors"
      >
        出品一覧
      </Link>
      <Link
        to="/buy-requests"
        onClick={closeMobile}
        className="text-gray-300 hover:text-white transition-colors"
      >
        買取一覧
      </Link>
      <Link
        to="/items"
        onClick={closeMobile}
        className="relative text-gray-300 hover:text-white transition-colors"
      >
        アイテム一覧
        {unverifiedItemCount > 0 && (
          <span
            title={`確認中アイテム ${unverifiedItemCount}件`}
            className="absolute -top-1.5 -right-3 bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none"
          >
            {unverifiedItemCount}
          </span>
        )}
      </Link>
    </>
  )

  return (
    <header className="bg-surface-card border-b border-surface-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="shrink-0">
          <img
            src="/img/logo_header.png"
            alt="MoE Trade"
            className="h-10 w-auto"
          />
        </Link>

        {/* デスクトップナビ（lg以上） */}
        <nav className="hidden lg:flex items-center gap-6 text-sm">
          {navLinks}
          {/* マイ取引・マイペ整理をトップ階層に直接表示 */}
          {user && (
            <>
              <Link
                to="/mypage"
                className="relative text-gray-300 hover:text-white transition-colors"
              >
                マイ取引
                {totalUnread > 0 && (
                  <span className="absolute -top-1.5 -right-3 bg-red-500 text-white text-xs rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
                    {totalUnread}
                  </span>
                )}
              </Link>
              <Link
                to="/mypage/items"
                className="text-gray-300 hover:text-white transition-colors"
              >
                マイペ整理
              </Link>
              <Link
                to="/board"
                className="relative text-gray-300 hover:text-white transition-colors"
              >
                運営掲示板
                {hasNewBoard && (
                  <span className="absolute -top-1 -right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full" />
                )}
              </Link>
            </>
          )}
          {/* 管理メニュー：editor/admin のみ表示（アイテム一覧はトップ階層へ移動） */}
          {(user?.role === 'editor' || user?.role === 'admin') && (
            <div ref={adminRef} className="relative">
              <button
                onClick={() => setAdminOpen((v) => !v)}
                className="relative text-gray-300 hover:text-white transition-colors flex items-center gap-1"
              >
                管理
                <span className="text-xs text-gray-500">{adminOpen ? '▲' : '▼'}</span>
                {!adminOpen && adminNotifCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-2.5 h-2.5 bg-red-500 rounded-full" />
                )}
              </button>
              {adminOpen && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-surface-card border border-surface-border rounded-lg shadow-xl overflow-hidden z-50">
                  <Link
                    to="/admin/bonus-value-labels"
                    onClick={() => setAdminOpen(false)}
                    className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-border hover:text-white transition-colors"
                  >
                    <span>項目名の管理</span>
                    {unorganizedLabelCount > 0 && (
                      <span
                        title={`未整理の項目名 ${unorganizedLabelCount}件`}
                        className="bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none"
                      >
                        {unorganizedLabelCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/admin/binder-labels"
                    onClick={() => setAdminOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-border hover:text-white transition-colors"
                  >
                    バインダーの管理
                  </Link>
                  {user?.role === 'admin' && (
                    <>
                      <Link
                        to="/admin/users"
                        onClick={() => setAdminOpen(false)}
                        className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-border hover:text-white transition-colors"
                      >
                        ユーザー管理
                      </Link>
                      <Link
                        to="/admin/announcements"
                        onClick={() => setAdminOpen(false)}
                        className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-border hover:text-white transition-colors"
                      >
                        お知らせ管理
                      </Link>
                      <Link
                        to="/admin/promo-tweets"
                        onClick={() => setAdminOpen(false)}
                        className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-border hover:text-white transition-colors"
                      >
                        宣伝ポスト
                      </Link>
                      <Link
                        to="/admin/excluded-items"
                        onClick={() => setAdminOpen(false)}
                        className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-border hover:text-white transition-colors"
                      >
                        <span>除外アイテム管理</span>
                        {excludedSuggestionCount > 0 && (
                          <span
                            title={`ユーザーが個別に除外しているアイテム ${excludedSuggestionCount}件`}
                            className="bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none"
                          >
                            {excludedSuggestionCount}
                          </span>
                        )}
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* デスクトップ右側のログイン操作 */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {user ? (
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ログアウト
            </button>
          ) : (
            <>
              <Link to="/auth/login" className="text-sm text-gray-300 hover:text-white transition-colors">
                ログイン
              </Link>
              <Link to="/auth/register" className="text-sm bg-primary-500 hover:bg-primary-600 text-white px-4 py-1.5 rounded-md transition-colors">
                新規登録
              </Link>
            </>
          )}
        </div>

        {/* モバイル用ハンバーガーボタン（lg未満） */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="lg:hidden relative -mr-1 p-2 text-gray-300 hover:text-white transition-colors"
          aria-label="メニュー"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
          {/* 未読・未確認の合計バッジ（メニューを閉じているときのみ） */}
          {!mobileOpen && (totalUnread > 0 || hasNewBoard || unverifiedItemCount > 0 || adminNotifCount > 0) && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
          )}
        </button>
      </div>

      {/* モバイルメニュー（オーバーレイ + ドロワー） */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-14 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <nav className="absolute top-0 right-0 w-72 max-w-[85vw] h-full bg-surface-card border-l border-surface-border shadow-xl overflow-y-auto flex flex-col p-4 text-sm">
            <Link to="/all" onClick={closeMobile} className="flex items-center justify-between py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors">
              出品一覧
            </Link>
            <Link to="/buy-requests" onClick={closeMobile} className="flex items-center justify-between py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors">
              買取一覧
            </Link>
            <Link to="/items" onClick={closeMobile} className="flex items-center justify-between py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors">
              <span>アイテム一覧</span>
              {unverifiedItemCount > 0 && (
                <span className="bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                  {unverifiedItemCount}
                </span>
              )}
            </Link>
            {user && (
              <>
                <Link to="/mypage" onClick={closeMobile} className="flex items-center justify-between py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors">
                  <span>マイ取引</span>
                  {totalUnread > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                      {totalUnread}
                    </span>
                  )}
                </Link>
                <Link to="/mypage/items" onClick={closeMobile} className="flex items-center justify-between py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors">
                  マイペ整理
                </Link>
                <Link to="/board" onClick={closeMobile} className="flex items-center justify-between py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors">
                  <span>運営掲示板</span>
                  {hasNewBoard && <span className="w-2 h-2 rounded-full bg-red-500" />}
                </Link>
              </>
            )}
            {(user?.role === 'editor' || user?.role === 'admin') && (
              <div className="mt-2 pt-4 border-t border-surface-border">
                <p className="text-xs text-gray-500 mb-1">管理</p>
                <Link
                  to="/admin/bonus-value-labels"
                  onClick={closeMobile}
                  className="flex items-center justify-between py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors"
                >
                  <span>項目名の管理</span>
                  {unorganizedLabelCount > 0 && (
                    <span className="bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                      {unorganizedLabelCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/admin/binder-labels"
                  onClick={closeMobile}
                  className="block py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors"
                >
                  バインダーの管理
                </Link>
                {user?.role === 'admin' && (
                  <>
                    <Link
                      to="/admin/users"
                      onClick={closeMobile}
                      className="block py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors"
                    >
                      ユーザー管理
                    </Link>
                    <Link
                      to="/admin/announcements"
                      onClick={closeMobile}
                      className="block py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors"
                    >
                      お知らせ管理
                    </Link>
                    <Link
                      to="/admin/promo-tweets"
                      onClick={closeMobile}
                      className="block py-3 border-b border-surface-border text-gray-300 hover:text-white transition-colors"
                    >
                      宣伝ポスト
                    </Link>
                    <Link
                      to="/admin/excluded-items"
                      onClick={closeMobile}
                      className="flex items-center justify-between py-3 text-gray-300 hover:text-white transition-colors"
                    >
                      <span>除外アイテム管理</span>
                      {excludedSuggestionCount > 0 && (
                        <span className="bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                          {excludedSuggestionCount}
                        </span>
                      )}
                    </Link>
                  </>
                )}
              </div>
            )}
            <div className="mt-auto pt-4 border-t border-surface-border">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="w-full text-left py-3 text-gray-400 hover:text-white transition-colors"
                >
                  ログアウト
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    to="/auth/login"
                    onClick={closeMobile}
                    className="w-full text-center py-2 border border-surface-border rounded-md text-gray-300 hover:text-white transition-colors"
                  >
                    ログイン
                  </Link>
                  <Link
                    to="/auth/register"
                    onClick={closeMobile}
                    className="w-full text-center bg-primary-500 hover:bg-primary-600 text-white py-2 rounded-md transition-colors"
                  >
                    新規登録
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* メール未認証ユーザー向けバナー */}
      <VerifyEmailBanner />

      {/* お知らせ（管理者がDBで設定） */}
      {visibleAnnouncements.map((a) => {
        const c =
          a.level === 'info'
            ? { wrap: 'bg-sky-900/30 border-sky-700/40 text-sky-200', link: 'text-sky-100' }
            : a.level === 'error'
            ? { wrap: 'bg-red-900/40 border-red-700/50 text-red-200', link: 'text-red-100' }
            : { wrap: 'bg-yellow-900/30 border-yellow-700/40 text-yellow-200', link: 'text-yellow-100' }
        return (
          <div key={a.id} className={`border-t text-xs sm:text-sm ${c.wrap}`}>
            <div className="max-w-7xl mx-auto px-4 py-2 leading-relaxed">
              <div className="flex items-start gap-3">
                <div className="flex-1 whitespace-pre-wrap">
                  {a.message}
                  {a.link_url && (
                    <>
                      {' '}
                      <a
                        href={a.link_url}
                        target={a.link_new_tab ? '_blank' : '_self'}
                        rel={a.link_new_tab ? 'noopener noreferrer' : undefined}
                        className={`underline hover:text-white transition-colors ${c.link}`}
                      >
                        {a.link_label || a.link_url}
                      </a>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissAnnouncement(a)}
                  title="このお知らせを表示しない"
                  className="shrink-0 underline opacity-70 hover:opacity-100 hover:text-white transition-colors whitespace-nowrap"
                >
                  表示しない
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </header>
  )
}
