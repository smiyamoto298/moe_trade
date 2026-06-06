import { Link, useNavigate } from 'react-router-dom'
import { useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'

export default function Header() {
  const { user, logout } = useAuth()
  const { totalUnread } = useNotification()
  const navigate = useNavigate()
  const [adminOpen, setAdminOpen] = useState(false)
  const adminRef = useRef<HTMLDivElement>(null)

  const handleLogout = async () => {
    await logout()
    navigate('/auth/login')
  }

  return (
    <header className="bg-surface-card border-b border-surface-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="text-lg font-bold text-primary-500 tracking-wide">
          MoE Trade
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <Link to="/listings" className="text-gray-300 hover:text-white transition-colors">
            出品一覧
          </Link>
          {user && (
            <>
              <Link to="/listings/new" className="text-gray-300 hover:text-white transition-colors">
                出品する
              </Link>
              <Link to="/board" className="text-gray-300 hover:text-white transition-colors">
                運営掲示板
              </Link>
              <Link to="/mypage" className="relative text-gray-300 hover:text-white transition-colors">
                マイページ
                {totalUnread > 0 && (
                  <span className="absolute -top-1.5 -right-3 bg-red-500 text-white text-xs rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
                    {totalUnread}
                  </span>
                )}
              </Link>
              {(user.role === 'admin' || user.role === 'editor') && (
                <div ref={adminRef} className="relative">
                  <button
                    onClick={() => setAdminOpen((v) => !v)}
                    className="text-gray-300 hover:text-white transition-colors flex items-center gap-1"
                  >
                    管理
                    <span className="text-xs text-gray-500">{adminOpen ? '▲' : '▼'}</span>
                  </button>
                  {adminOpen && (
                    <div className="absolute top-full left-0 mt-1 w-36 bg-surface-card border border-surface-border rounded-lg shadow-xl overflow-hidden z-50">
                      <Link
                        to="/admin/items"
                        onClick={() => setAdminOpen(false)}
                        className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-border hover:text-white transition-colors"
                      >
                        アイテム管理
                      </Link>
                      {user.role === 'admin' && (
                        <Link
                          to="/admin/users"
                          onClick={() => setAdminOpen(false)}
                          className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-border hover:text-white transition-colors"
                        >
                          ユーザー管理
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
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
      </div>

      {/* テスト運用中のお知らせ */}
      <div className="bg-yellow-900/30 border-t border-yellow-700/40 text-yellow-200 text-xs sm:text-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 leading-relaxed">
          現在テスト運用中です！大規模な修正が必要になった場合データがリセットされる場合があります！
          最新情報はX（
          <a
            href="https://x.com/senir_moe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-100 underline hover:text-white transition-colors"
          >
            @senir_moe
          </a>
          ）でご確認ください！
        </div>
      </div>
    </header>
  )
}
