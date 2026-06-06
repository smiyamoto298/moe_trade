import client from './client'
import type { User } from '../types'

export const authApi = {
  register: (data: {
    email: string
    password: string
    password_confirmation: string
    characters?: { server: string; character_name: string }[]
  }) => client.post<{ user: User; token: string }>('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    client.post<{ user: User; token: string }>('/auth/login', data),

  logout: () => client.post('/auth/logout'),

  me: () => client.get<User>('/auth/me'),

  forgotPassword: (data: { email: string }) =>
    client.post<{ message: string }>('/auth/forgot-password', data),

  resetPassword: (data: {
    token: string
    email: string
    password: string
    password_confirmation: string
  }) => client.post<{ message: string }>('/auth/reset-password', data),
}
