import client from './client'

export interface BonusValueLabel {
  id: number
  label: string
  // true: 整理済み（左ペイン・sort_order 順）。false: 未整理（右ペイン・文字順）。
  is_organized: boolean
  sort_order: number
}

export const bonusValueLabelsApi = {
  // 公開: 候補文字列の配列（整理済み→未整理の順）。登録フォーム・絞り込みの候補に使用。
  list: (): Promise<{ data: string[] }> => client.get<string[]>('/bonus-value-labels'),
  // 管理: 全件（id・整理済みフラグ付き）
  adminList: (): Promise<{ data: BonusValueLabel[] }> =>
    client.get<BonusValueLabel[]>('/admin/bonus-value-labels'),
  create: (label: string) => client.post<BonusValueLabel>('/admin/bonus-value-labels', { label }),
  update: (id: number, label: string) =>
    client.put<BonusValueLabel>(`/admin/bonus-value-labels/${id}`, { label }),
  remove: (id: number) => client.delete(`/admin/bonus-value-labels/${id}`),
  // 整理済み（左ペイン）の並びを確定する。ids がそのまま整理済みの順序になり、
  // 含まれない項目はすべて未整理に戻る。
  organize: (ids: number[]) => client.post('/admin/bonus-value-labels/organize', { ids }),
}
