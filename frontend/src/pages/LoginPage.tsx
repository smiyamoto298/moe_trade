import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const resetDone = params.get('reset') === '1'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('メールアドレスまたはパスワードが正しくありません')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-8">ログイン</h1>

        <form onSubmit={handleSubmit} className="bg-surface-card border border-surface-border rounded-lg p-6 space-y-4">
          {resetDone && (
            <div className="bg-green-900/30 border border-green-600/50 rounded px-3 py-2 text-sm text-green-300">
              パスワードを再設定しました。新しいパスワードでログインしてください。
            </div>
          )}
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

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-gray-400">パスワード</label>
              <Link to="/auth/forgot-password" className="text-xs text-primary-500 hover:underline">
                パスワードをお忘れですか？
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white py-2 rounded-md text-sm font-medium transition-colors"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-4">
          アカウントをお持ちでない方は{' '}
          <Link to="/auth/register" className="text-primary-500 hover:underline">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  )
}
