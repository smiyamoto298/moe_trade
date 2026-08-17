import client from './client'

// 通知設定（種別 × チャネルの ON/OFF・メール通知の宛先）。
// 通知先メールは本人にしか返らない（サーバー側で認証ユーザーの分だけを返す）。

/** 通知の種別。users の push_notify_* / email_notify_* 列と対応する。 */
export type NotificationCategory = 'trade' | 'auction' | 'expiry' | 'listing' | 'buying'

/** 通知先メールの状態。画面の案内文の出し分けに使う。 */
export type NotificationEmailStatus =
  | 'none' // 未設定（メール通知は届かない）
  | 'verified' // 確認済み
  | 'pending_confirmation' // 確認メールのリンク待ち
  | 'pending_account_verification' // ログイン用と同じアドレスだが、アカウントのメール認証がまだ

export type NotificationToggles = Record<NotificationCategory, boolean>

export interface NotificationSettings {
  notification_email: string | null
  notification_email_verified: boolean
  notification_email_status: NotificationEmailStatus
  is_login_email: boolean
  push: NotificationToggles
  email: NotificationToggles
}

/** 設定画面に並べる種別（表示順・ラベル・説明）。 */
export const NOTIFICATION_CATEGORIES: {
  key: NotificationCategory
  label: string
  description: string
}[] = [
  {
    key: 'trade',
    label: '取引',
    description: '新しい取引希望・販売希望、新着メッセージ、取引成立・見送り',
  },
  {
    key: 'auction',
    label: 'オークション',
    description: '入札あり、価格更新（入札を抜かれた）、落札・落選、成立・不成立',
  },
  {
    key: 'expiry',
    label: '期限切れ',
    description: '自分の出品・買取が期限切れになる前日のお知らせ',
  },
  {
    key: 'listing',
    label: '新規出品',
    description: '誰かが新しく出品したとき（すべての出品が対象・初期設定はOFF）',
  },
  {
    key: 'buying',
    label: '新規買取',
    description: '誰かが新しく買取を登録したとき（すべての買取が対象・初期設定はOFF）',
  },
]

export const notificationSettingsApi = {
  get: () => client.get<NotificationSettings>('/notification-settings'),
  update: (data: { push: NotificationToggles; email: NotificationToggles }) =>
    client.put<NotificationSettings>('/notification-settings', data),
  setEmail: (email: string) =>
    client.put<NotificationSettings>('/notification-settings/email', { email }),
  clearEmail: () => client.delete<NotificationSettings>('/notification-settings/email'),
}
