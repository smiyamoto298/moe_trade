import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi } from '../api/auth'
import { saveToken, removeToken, getToken } from '../api/client'
import { USE_MOCK } from '../api/mock'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (USE_MOCK) return
    // トークンが無ければ未ログイン確定。無駄な401を発生させない
    if (!getToken()) {
      setUser(null)
      return
    }
    try {
      const res = await authApi.me()
      setUser(res.data)
    } catch {
      setUser(null)
    }
  }

  useEffect(() => {
    if (USE_MOCK) {
      setUser({
        id: 99,
        email: 'mock@example.com',
        role: 'admin', // 管理画面確認時は 'admin' | 'editor' | 'user' に変更
        is_suspended: false,
        email_verified_at: new Date().toISOString(),
        register_ip: '127.0.0.1',
        characters: [
          { id: 1, server: 'Emerald', character_name: 'MockUser' },
          { id: 2, server: 'Diamond', character_name: 'MockUser2' },
        ],
      })
      setLoading(false)
      return
    }
    refresh().finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const res = await authApi.login({ email, password })
    saveToken(res.data.token)
    setUser(res.data.user)
  }

  const logout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    removeToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
