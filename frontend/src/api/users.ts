import client from './client'
import { USE_MOCK, mockUsers } from './mock'
import type { User, UserRole } from '../types'

export const usersApi = {
  list: (): Promise<{ data: User[] }> => {
    if (USE_MOCK) return Promise.resolve({ data: [...mockUsers] })
    // ページネーション形式 {data: [...]} と素の配列の両方に対応
    return client.get<User[] | { data: User[] }>('/admin/users')
      .then((r) => ({ data: Array.isArray(r.data) ? r.data : r.data.data }))
  },

  updateRole: (id: number, role: UserRole): Promise<{ data: User }> => {
    if (USE_MOCK) {
      const user = mockUsers.find((u) => u.id === id)!
      user.role = role
      return Promise.resolve({ data: { ...user } })
    }
    return client.put<User>(`/admin/users/${id}/role`, { role })
  },

  suspend: (id: number): Promise<{ data: User }> => {
    if (USE_MOCK) {
      const user = mockUsers.find((u) => u.id === id)!
      user.is_suspended = true
      return Promise.resolve({ data: { ...user } })
    }
    return client.post<User>(`/admin/users/${id}/suspend`)
  },

  unsuspend: (id: number): Promise<{ data: User }> => {
    if (USE_MOCK) {
      const user = mockUsers.find((u) => u.id === id)!
      user.is_suspended = false
      return Promise.resolve({ data: { ...user } })
    }
    return client.post<User>(`/admin/users/${id}/unsuspend`)
  },
}
