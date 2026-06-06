import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/auth'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''

  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const invalidLink = !token || !email

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmation) {
      setError('パスワードが一致しません')
      return
    }
    setError('')
    setLoading(true)
    try {
      await authApi.resetPassword({
        token,
        email,
        password,
        password_confirmation: confirmation,
      })
      navigate('/auth/login?reset=1')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'パスワードの再設定に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-8">新しいパスワードの設定</h1>

        {invalidLink ? (
          <div className="bg-surface-card border border-surface-border rounded-lg p-6 space-y-4">
            <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">
              リンクが無効です。お手数ですが、再度パスワード再設定をやり直してください。
            </div>
            <Link
              to="/auth/forgot-password"
              className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white py-2 rounded-md text-sm font-medium transition-colors"
            >
              再設定をやり直す
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-surface-card border border-surface-border rounded-lg p-6 space-y-4">
            {error && (
              <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1">メールアドレス</label>
              <input
                type="email"
                value={email}
                readOnly
                className="w-full bg-surface/50 border border-surface-border rounded px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">新しいパスワード</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">新しいパスワード（確認）</label>
              <input
                type="password"
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white py-2 rounded-md text-sm font-medium transition-colors"
            >
              {loading ? '設定中...' : 'パスワードを再設定'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-400 mt-4">
          <Link to="/auth/login" className="text-primary-500 hover:underline">
            ログイン画面へ戻る
          </Link>
        </p>
      </div>
    </div>
  )
}
