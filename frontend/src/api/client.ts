import axios from 'axios'

const TOKEN_KEY = 'auth_token'

export const saveToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const removeToken = () => localStorage.removeItem(TOKEN_KEY)

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

// リクエストにトークンを付与
client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// レスポンスエラーハンドリング
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // 失効したトークンは破棄する（以後は未ログインとして振る舞う）
      if (getToken()) removeToken()

      // ログインへ強制リダイレクトするのは「ログイン必須ページ」にいる場合のみ。
      // 出品一覧などの公開ページでは未ログイン表示のままにする
      // （メールリンクで開く /auth/reset-password 等が飛ばされる問題の防止も兼ねる）。
      const protectedPrefixes = ['/mypage', '/admin', '/board', '/listings/new']
      const path = window.location.pathname
      if (protectedPrefixes.some((p) => path === p || path.startsWith(p + '/'))) {
        window.location.href = '/auth/login'
      }
    }
    return Promise.reject(err)
  }
)

export default client
