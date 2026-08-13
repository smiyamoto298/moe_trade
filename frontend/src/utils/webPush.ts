import { pushApi } from '../api/push'

/** VAPID 公開鍵（base64url）を PushManager.subscribe が受け取れるバイト列へ変換する。 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

/** このブラウザが Web Push に対応しているか（iOS Safari はホーム画面追加時のみ対応）。 */
export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Service Worker を登録して Web Push を購読し、購読情報をサーバーへ登録する。
 * 通知許可済みであることが前提。成功で true（未対応・サーバー鍵未設定・失敗は false）。
 */
export async function subscribeWebPush(): Promise<boolean> {
  if (!isWebPushSupported() || Notification.permission !== 'granted') {
    return false
  }
  try {
    const { data } = await pushApi.publicKey()
    if (!data.public_key) return false

    await navigator.serviceWorker.register('/sw.js')
    const registration = await navigator.serviceWorker.ready

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key) as BufferSource,
      }))

    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

    // ログイン中ユーザーの購読としてサーバーへ登録（既存エンドポイントは付け替え）
    await pushApi.subscribe({ endpoint: json.endpoint, keys: json.keys })
    return true
  } catch {
    return false
  }
}

/**
 * Web Push の購読を解除する（通知OFF）。
 * サーバー側の購読行を削除してからブラウザの購読を解除する。
 * 未対応・未購読の環境では何もしない。
 */
export async function unsubscribeWebPush(): Promise<void> {
  if (!isWebPushSupported()) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    await pushApi.unsubscribe(subscription.endpoint).catch(() => {})
    await subscription.unsubscribe()
  } catch {
    /* 解除失敗は無視（オプトアウト中はフラグ側で自動再購読を抑制する） */
  }
}
