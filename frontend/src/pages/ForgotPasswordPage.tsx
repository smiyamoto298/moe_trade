import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../api/auth'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.forgotPassword({ email })
      setSent(true)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 429) {
        setError('リクエストが多すぎます。しばらく待ってから再度お試しください。')
      } else {
        setError('送信に失敗しました。時間をおいて再度お試しください。')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-8">パスワードの再設定</h1>

        {sent ? (
          <div className="bg-surface-card border border-surface-border rounded-lg p-6 space-y-4">
            <div className="bg-green-900/30 border border-green-600/50 rounded px-3 py-2 text-sm text-green-300">
              パスワード再設定用のメールを送信しました。メールに記載のリンクから再設定してください。
            </div>
            <p className="text-xs text-gray-400">
              メールが届かない場合は、入力したアドレスや迷惑メールフォルダをご確認ください。
            </p>
            <Link
              to="/auth/login"
              className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white py-2 rounded-md text-sm font-medium transition-colors"
            >
              ログイン画面へ戻る
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-surface-card border border-surface-border rounded-lg p-6 space-y-4">
            <p className="text-xs text-gray-400">
              ご登録のメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
            </p>

            {error && (
              <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1">メールアドレス</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white py-2 rounded-md text-sm font-medium transition-colors"
            >
              {loading ? '送信中...' : '再設定メールを送信'}
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
