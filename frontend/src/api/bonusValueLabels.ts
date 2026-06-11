import client from './client'

export interface BonusValueLabel {
  id: number
  label: string
  sort_order: number
}

export const bonusValueLabelsApi = {
  // 公開: 候補文字列の配列（並び順）。登録フォーム・絞り込みの候補に使用。
  list: (): Promise<{ data: string[] }> => client.get<string[]>('/bonus-value-labels'),
  // 管理: 全件（id 付き）
  adminList: (): Promise<{ data: BonusValueLabel[] }> =>
    client.get<BonusValueLabel[]>('/admin/bonus-value-labels'),
  create: (label: string) => client.post<BonusValueLabel>('/admin/bonus-value-labels', { label }),
  update: (id: number, label: string) =>
    client.put<BonusValueLabel>(`/admin/bonus-value-labels/${id}`, { label }),
  remove: (id: number) => client.delete(`/admin/bonus-value-labels/${id}`),
  reorder: (ids: number[]) => client.post('/admin/bonus-value-labels/reorder', { ids }),
}
