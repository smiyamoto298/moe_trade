import client from './client'

// 項目名候補の種別。bonus=付加効果の項目名 / stat=追加効果「その他」の項目名
export type BonusValueLabelKind = 'bonus' | 'stat'

export interface BonusValueLabel {
  id: number
  kind: BonusValueLabelKind
  label: string
  // true: 整理済み（左ペイン・sort_order 順）。false: 未整理（右ペイン・文字順）。
  is_organized: boolean
  sort_order: number
}

export const bonusValueLabelsApi = {
  // 公開: 候補文字列の配列（整理済み→未整理の順）。登録フォーム・絞り込みの候補に使用。
  list: (kind: BonusValueLabelKind = 'bonus'): Promise<{ data: string[] }> =>
    client.get<string[]>(`/bonus-value-labels?kind=${kind}`),
  // 管理: 全件（id・整理済みフラグ付き）
  adminList: (kind: BonusValueLabelKind = 'bonus'): Promise<{ data: BonusValueLabel[] }> =>
    client.get<BonusValueLabel[]>(`/admin/bonus-value-labels?kind=${kind}`),
  create: (label: string, kind: BonusValueLabelKind = 'bonus') =>
    client.post<BonusValueLabel>('/admin/bonus-value-labels', { label, kind }),
  update: (id: number, label: string) =>
    client.put<BonusValueLabel>(`/admin/bonus-value-labels/${id}`, { label }),
  remove: (id: number) => client.delete(`/admin/bonus-value-labels/${id}`),
  // 整理済み（左ペイン）の並びを種別内で確定する。ids がそのまま整理済みの順序になり、
  // 同一種別で含まれない項目はすべて未整理に戻る。
  organize: (ids: number[], kind: BonusValueLabelKind = 'bonus') =>
    client.post('/admin/bonus-value-labels/organize', { ids, kind }),
  // 未整理の項目名(id)を同一種別の整理済み項目名(targetId)へ統合する。
  // 統合元を使用しているアイテム側（stat=追加効果その他 / bonus=付加効果の項目名）も一括更新され、統合元は削除される。
  merge: (id: number, targetId: number) =>
    client.post<{ merged_into: { id: number; label: string }; updated_count: number }>(
      `/admin/bonus-value-labels/${id}/merge`,
      { target_id: targetId },
    ),
}
