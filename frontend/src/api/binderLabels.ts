import client from './client'

export interface BinderLabel {
  id: number
  label: string
  sort_order: number
}

export const binderLabelsApi = {
  // 公開: 候補文字列の配列（並び順）。レシピ登録のバインダー入力候補に使用。
  list: (): Promise<{ data: string[] }> => client.get<string[]>('/binder-labels'),
  // 管理: 全件（id 付き）
  adminList: (): Promise<{ data: BinderLabel[] }> =>
    client.get<BinderLabel[]>('/admin/binder-labels'),
  create: (label: string) => client.post<BinderLabel>('/admin/binder-labels', { label }),
  update: (id: number, label: string) =>
    client.put<BinderLabel>(`/admin/binder-labels/${id}`, { label }),
  remove: (id: number) => client.delete(`/admin/binder-labels/${id}`),
  reorder: (ids: number[]) => client.post('/admin/binder-labels/reorder', { ids }),
}
