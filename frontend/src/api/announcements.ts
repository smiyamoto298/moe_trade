import client from './client'
import type { Announcement } from '../types'

export interface AnnouncementPayload {
  message: string
  level?: string
  link_url?: string | null
  link_label?: string | null
  link_new_tab?: boolean
  is_active?: boolean
  // 表示期間（日数）。null = 無期限。
  display_days?: number | null
  // 表示対象。all=全員 / staff=管理・編集者のみ / specific=指定ユーザーのみ。
  target_type?: 'all' | 'staff' | 'specific'
  // target_type='specific' のときの対象ユーザーID配列。
  target_user_ids?: number[] | null
}

export const announcementsApi = {
  // 公開: 表示中のお知らせ
  list: (): Promise<{ data: Announcement[] }> => client.get<Announcement[]>('/announcements'),
  // 管理: 全件
  adminList: (): Promise<{ data: Announcement[] }> => client.get<Announcement[]>('/admin/announcements'),
  create: (data: AnnouncementPayload) => client.post<Announcement>('/admin/announcements', data),
  update: (id: number, data: AnnouncementPayload) => client.put<Announcement>(`/admin/announcements/${id}`, data),
  remove: (id: number) => client.delete(`/admin/announcements/${id}`),
  // パネルの並び順を保存（表示順に並んだ id 配列）
  reorder: (ids: number[]) => client.post('/admin/announcements/reorder', { ids }),
}
