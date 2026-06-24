import client from './client'
import type { ExcludedItem, ExcludedItemsPublic, ExclusionType, UserExclusionSuggestion, ServerExcludedItem } from '../types'

export const excludedItemsApi = {
  // 公開: 共通除外アイテムと種別（貼り付け除外に使用）
  list: (): Promise<{ data: ExcludedItemsPublic }> => client.get<ExcludedItemsPublic>('/excluded-items'),

  // 端末保存ユーザーが除外した名前を匿名で報告（共通除外の昇格候補に合流）。失敗は致命でない。
  report: (names: string[]): Promise<void> =>
    client.post('/excluded-items/report', { names }).then(() => undefined),

  // 管理: 全件（id 付き）
  adminList: (): Promise<{ data: ExcludedItem[] }> => client.get<ExcludedItem[]>('/admin/excluded-items'),

  // 管理: ユーザー個別除外（DB保存分）を名前で集計した、共通除外への昇格候補
  userSuggestions: (): Promise<{ data: UserExclusionSuggestion[] }> =>
    client.get<UserExclusionSuggestion[]>('/admin/excluded-items/user-suggestions'),

  // 管理: 候補名を「共通にしない」と却下（以後 userSuggestions に出さない）
  dismissSuggestion: (name: string): Promise<void> =>
    client.post('/admin/excluded-items/dismiss-suggestion', { name }).then(() => undefined),

  // 管理: 複数名をまとめて登録（改行区切り由来）。重複は無視される。種別未指定は既定「その他」。
  create: (names: string[], exclusionTypeId?: number | null): Promise<{ data: { created_count: number; skipped_count: number } }> =>
    client.post('/admin/excluded-items', { names, exclusion_type_id: exclusionTypeId ?? null }).then((r) => ({ data: r.data })),

  // 管理: 除外アイテムの名前・種別を更新
  update: (id: number, patch: { name?: string; exclusion_type_id?: number | null }): Promise<{ data: ExcludedItem }> =>
    client.put<ExcludedItem>(`/admin/excluded-items/${id}`, patch),

  remove: (id: number): Promise<void> =>
    client.delete(`/admin/excluded-items/${id}`).then(() => undefined),

  // 管理: 選択した除外アイテムを一括削除
  removeMany: (ids: number[]): Promise<{ data: { deleted_count: number } }> =>
    client.delete('/admin/excluded-items', { data: { ids } }),

  // ---- 種別（カテゴリ）管理（admin） ----
  typeList: (): Promise<{ data: ExclusionType[] }> => client.get<ExclusionType[]>('/admin/exclusion-types'),

  createType: (name: string, defaultEnabled = true): Promise<{ data: ExclusionType }> =>
    client.post<ExclusionType>('/admin/exclusion-types', { name, default_enabled: defaultEnabled }),

  // 種別の改名・既定ON/OFF（default_enabled）を部分更新
  updateType: (id: number, patch: { name?: string; default_enabled?: boolean }): Promise<{ data: ExclusionType }> =>
    client.put<ExclusionType>(`/admin/exclusion-types/${id}`, patch),

  removeType: (id: number): Promise<void> =>
    client.delete(`/admin/exclusion-types/${id}`).then(() => undefined),
}

// 「サーバ登録対象外」のシステム共通アイテム名（保存先がサーバーでもローカル保存する対象）。
export const serverExcludedItemsApi = {
  // 公開: システム共通の対象外名（文字列配列）。分割保存判定に使用。
  list: (): Promise<{ data: string[] }> => client.get<string[]>('/server-excluded-items'),

  // 管理: 全件（id 付き）
  adminList: (): Promise<{ data: ServerExcludedItem[] }> =>
    client.get<ServerExcludedItem[]>('/admin/server-excluded-items'),

  // 管理: 複数名をまとめて登録（改行・カンマ区切り由来）。重複は無視される。
  create: (names: string[]): Promise<{ data: { created_count: number; skipped_count: number } }> =>
    client.post('/admin/server-excluded-items', { names }).then((r) => ({ data: r.data })),

  remove: (id: number): Promise<void> =>
    client.delete(`/admin/server-excluded-items/${id}`).then(() => undefined),

  removeMany: (ids: number[]): Promise<{ data: { deleted_count: number } }> =>
    client.delete('/admin/server-excluded-items', { data: { ids } }),
}
