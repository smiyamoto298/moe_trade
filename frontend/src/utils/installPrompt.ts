/**
 * Android Chrome の「アプリをインストール」をサイト内のボタンから起動する仕組み。
 *
 * Chrome はインストール条件（HTTPS / manifest に 192・512 アイコン / SW 登録済み /
 * オフラインで 200 を返す fetch ハンドラ）を満たしたときだけ beforeinstallprompt を発火する。
 * このイベントを横取りして保持し、任意のタイミングで prompt() を呼ぶ。
 *
 * iOS Safari は beforeinstallprompt を実装しておらず、JS からホーム画面追加を起動する
 * API も存在しないため、この仕組みは Android（および デスクトップ Chrome / Edge）専用。
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

/** 「あとで」を選んだら以後バナーは出さない（端末ごとに localStorage で保持） */
const DISMISSED_KEY = 'pwa_install_dismissed'

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<(available: boolean) => void>()

function notify(available: boolean) {
  listeners.forEach((fn) => fn(available))
}

/** インストール可能状態の変化を購読する。戻り値を呼ぶと解除。 */
export function subscribeInstallAvailability(listener: (available: boolean) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 現時点でインストールボタンを出せるか */
export function isInstallAvailable(): boolean {
  return deferredPrompt !== null
}

/** インストールバナーで「あとで」を選んだ端末か */
export function isInstallDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** 「あとで」を記録する（localStorage が使えない環境では何もしない） */
export function markInstallDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    /* localStorage が使えない環境ではセッション内のみ非表示 */
  }
}

/** 既にホーム画面のアプリとして起動しているか（インストール済みならボタンを出さない） */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari の独自プロパティ
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * beforeinstallprompt / appinstalled の待ち受けを開始する。
 * イベントはページ読み込み直後に飛ぶことがあるため、アプリ起動時（main.tsx）に呼ぶ。
 */
export function installPromptCapture(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (e) => {
    // Chrome 既定のミニインフォバーを抑止し、自前のボタンから出す
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notify(true)
  })

  window.addEventListener('appinstalled', () => {
    // インストール後はボタンを消す（prompt は使い切りで再利用できない）
    deferredPrompt = null
    notify(false)
  })
}

/**
 * インストールダイアログを表示する。
 * prompt() は1回しか使えないため、結果にかかわらず保持中のイベントを破棄する。
 * @returns ユーザーが承諾したか（未保持・失敗時は false）
 */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt
  if (!event) return false
  deferredPrompt = null
  notify(false)
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome === 'accepted'
  } catch {
    return false
  }
}

/** テスト用: 内部状態を初期化する */
export function resetInstallPromptForTest(): void {
  deferredPrompt = null
  listeners.clear()
}
