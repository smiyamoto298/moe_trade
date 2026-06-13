import client from './client'
import type { ExcludedItem, UserExclusionSuggestion } from '../types'

export const excludedItemsApi = {
  // 公開: 共通除外アイテム名の配列（貼り付け除外に使用）
  list: (): Promise<{ data: string[] }> => client.get<string[]>('/excluded-items'),

  // 管理: 全件（id 付き）
  adminList: (): Promise<{ data: ExcludedItem[] }> => client.get<ExcludedItem[]>('/admin/excluded-items'),

  // 管理: ユーザー個別除外（DB保存分）を名前で集計した、共通除外への昇格候補
  userSuggestions: (): Promise<{ data: UserExclusionSuggestion[] }> =>
    client.get<UserExclusionSuggestion[]>('/admin/excluded-items/user-suggestions'),

  // 管理: 候補名を「共通にしない」と却下（以後 userSuggestions に出さない）
  dismissSuggestion: (name: string): Promise<void> =>
    client.post('/admin/excluded-items/dismiss-suggestion', { name }).then(() => undefined),

  // 管理: 複数名をまとめて登録（改行区切り由来）。重複は無視される。
  create: (names: string[]): Promise<{ data: { created_count: number; skipped_count: number } }> =>
    client.post('/admin/excluded-items', { names }).then((r) => ({ data: r.data })),

  update: (id: number, name: string): Promise<{ data: ExcludedItem }> =>
    client.put<ExcludedItem>(`/admin/excluded-items/${id}`, { name }),

  remove: (id: number): Promise<void> =>
    client.delete(`/admin/excluded-items/${id}`).then(() => undefined),

  // 管理: 選択した除外アイテムを一括削除
  removeMany: (ids: number[]): Promise<{ data: { deleted_count: number } }> =>
    client.delete('/admin/excluded-items', { data: { ids } }),
}
