import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { authApi } from '../api/auth'

/**
 * メール未認証ユーザー向けバナー（ヘッダー直下に表示）。
 * メールはハッシュ化保存のため、再送時に平文アドレスの入力が必要。
 */
export default function VerifyEmailBanner() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  if (!user || user.email_verified_at) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError('')
    try {
      await authApi.resendVerification(email)
      setSent(true)
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      setError(message ?? '送信に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-orange-900/40 border-t border-orange-600/50 text-orange-200 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2">
        {sent ? (
          <p className="text-emerald-300">
            ✓ 認証メールを再送信しました。メール内のリンクをクリックして認証を完了してください。
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>⚠ 出品・取引にはメールアドレスの認証が必要です。</span>
              <button
                onClick={() => setOpen((v) => !v)}
                className="underline text-orange-100 hover:text-white transition-colors"
              >
                認証メールを再送する
              </button>
              <span>
                認証メールが届かない場合は
                <Link to="/board" className="underline text-orange-100 hover:text-white transition-colors">
                  運営掲示板
                </Link>
                でご連絡ください！
              </span>
            </div>
            {open && (
              <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 mt-2">
                <input
                  type="email"
                  required
                  placeholder="登録したメールアドレスを入力"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-surface border border-surface-border rounded px-3 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-64"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-1.5 rounded transition-colors"
                >
                  {sending ? '送信中...' : '送信'}
                </button>
                {error && <span className="text-red-300">{error}</span>}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
