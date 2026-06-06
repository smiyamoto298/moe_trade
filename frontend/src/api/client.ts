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
    const authPages = ['/auth/login', '/auth/register']
    if (err.response?.status === 401 && !authPages.includes(window.location.pathname)) {
      removeToken()
      window.location.href = '/auth/login'
    }
    return Promise.reject(err)
  }
)

export default client
