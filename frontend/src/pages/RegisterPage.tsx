import { useState, useId, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { saveToken } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useTour, hasSeenTour } from '../tours/TourContext'
import { SERVERS } from '../types'
import { SERVER_COLORS } from '../utils/constants'
import TermsModal from '../components/TermsModal'

export default function RegisterPage() {
  const { refresh } = useAuth()
  const { startTour } = useTour()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', password_confirmation: '' })
  const [characters, setCharacters] = useState<Record<string, string>>({})
  // 出品・買取登録時に既定で選択するサーバー（複数可）
  const [defaultServers, setDefaultServers] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const pwId = useId()

  // 規約同意後に操作案内ツアーを開始する（規約モーダルに被らないようにするため）。
  // 既読判定は version 連動（hasSeenTour）。content.ts の version を上げれば再表示される。
  useEffect(() => {
    if (!agreed) return
    if (hasSeenTour('register')) return
    const t = setTimeout(() => startTour('register'), 400)
    return () => clearTimeout(t)
  }, [agreed, startTour])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed) {
      setError('利用規約およびプライバシーポリシーに同意してください')
      return
    }
    if (!showPassword && form.password !== form.password_confirmation) {
      setError('パスワードが一致しません')
      return
    }
    setError('')
    setLoading(true)
    try {
      const charList = Object.entries(characters)
        .filter(([, name]) => name.trim())
        .map(([server, character_name]) => ({
          server,
          character_name: character_name.trim(),
          is_default: !!defaultServers[server],
        }))
      const payload = showPassword
        ? { ...form, password_confirmation: form.password }
        : form
      const res = await authApi.register({ ...payload, characters: charList })
      saveToken(res.data.token)
      await refresh()
      navigate('/')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }))

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-8">
      {!agreed && (
        <TermsModal
          onAgree={() => setAgreed(true)}
          onDecline={() => navigate('/')}
        />
      )}
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-white text-center mb-8">新規登録</h1>

        <form onSubmit={handleSubmit} className="bg-surface-card border border-surface-border rounded-lg p-6 space-y-5">
          {error && (
            <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* アカウント情報 */}
          <div data-tour="register-account" className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">メールアドレス</label>
              <input
                type="email" required value={form.email} onChange={set('email')}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label htmlFor={pwId} className="block text-xs text-gray-400 mb-1">パスワード</label>
              <div className="relative">
                <input
                  id={pwId}
                  type={showPassword ? 'text' : 'password'}
                  required minLength={8} value={form.password} onChange={set('password')}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {!showPassword && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">パスワード（確認）</label>
                <input
                  type="password" required value={form.password_confirmation} onChange={set('password_confirmation')}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                />
              </div>
            )}
          </div>

          {/* キャラクター名 */}
          <div data-tour="register-characters">
            <p className="text-xs font-semibold text-gray-300 mb-2">
              キャラクター名
              <span className="text-gray-500 font-normal ml-1">（任意・後から設定可）</span>
            </p>
            <div className="space-y-2">
              {SERVERS.map((server) => {
                const hasName = !!(characters[server] ?? '').trim()
                const on = !!defaultServers[server]
                return (
                  <div key={server} className="flex items-center gap-3 px-3 py-2 rounded border border-surface-border">
                    <span className={`text-xs font-medium w-16 shrink-0 ${SERVER_COLORS[server].split(' ')[1]}`}>
                      {server}
                    </span>
                    <input
                      type="text"
                      placeholder="キャラクター名"
                      value={characters[server] ?? ''}
                      onChange={(e) => setCharacters((p) => ({ ...p, [server]: e.target.value }))}
                      className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs ${hasName ? 'text-gray-300' : 'text-gray-600'}`}>デフォルト</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on && hasName}
                        disabled={!hasName}
                        onClick={() => setDefaultServers((p) => ({ ...p, [server]: !p[server] }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40 ${on && hasName ? 'bg-primary-500' : 'bg-surface-border'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${on && hasName ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
              「デフォルト」をONにすると、出品・買取登録時にそのサーバーが初めから選択されます（複数可）。
            </p>
          </div>

          <button
            data-tour="register-submit"
            type="submit" disabled={loading || !agreed}
            className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md text-sm font-medium transition-colors"
          >
            {loading ? '登録中...' : '登録する'}
          </button>

          <p className="text-xs text-gray-500 text-center">
            登録後、メール認証が必要です。出品するには認証を完了してください。
          </p>
        </form>

        <p className="text-center text-sm text-gray-400 mt-4">
          すでにアカウントをお持ちの方は{' '}
          <Link to="/auth/login" className="text-primary-500 hover:underline">ログイン</Link>
        </p>
      </div>
    </div>
  )
}
