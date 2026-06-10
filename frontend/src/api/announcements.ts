import client from './client'
import type { Announcement } from '../types'

export interface AnnouncementPayload {
  message: string
  level?: string
  link_url?: string | null
  link_label?: string | null
  is_active?: boolean
  sort_order?: number
}

export const announcementsApi = {
  // 公開: 表示中のお知らせ
  list: (): Promise<{ data: Announcement[] }> => client.get<Announcement[]>('/announcements'),
  // 管理: 全件
  adminList: (): Promise<{ data: Announcement[] }> => client.get<Announcement[]>('/admin/announcements'),
  create: (data: AnnouncementPayload) => client.post<Announcement>('/admin/announcements', data),
  update: (id: number, data: AnnouncementPayload) => client.put<Announcement>(`/admin/announcements/${id}`, data),
  remove: (id: number) => client.delete(`/admin/announcements/${id}`),
}
