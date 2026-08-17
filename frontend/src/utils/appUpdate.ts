/**
 * デプロイ済みの新しいフロントを検知する仕組み。
 *
 * ビルド時に vite.config.ts が __BUILD_ID__ を焼き込み、同じ値を dist/version.json に出力する。
 * クライアントは「自分に焼き込まれた値」と「サーバー上の最新値」を比較し、
 * 差があれば更新バナーを出してリロードを促す。
 *
 * PWA（standalone）はユーザーがアプリを閉じないため、古い JS が新しい API を叩く事故が
 * 通常のタブより起きやすい。長時間開きっぱなしのタブにも同じ効果がある。
 */

/** 最新ビルドIDの配信元。.htaccess で no-cache 指定していること（キャッシュされると無意味になる） */
export const VERSION_URL = '/version.json'

/** 保険のポーリング間隔。主契機は visibilitychange なので長めで十分 */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

/**
 * サーバー上の最新ビルドIDを取得する。
 * 取得失敗（オフライン・デプロイ中の一瞬など）は null を返し、呼び出し側では何もしない。
 */
export async function fetchLatestBuildId(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(VERSION_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const json: unknown = await res.json()
    const build = (json as { build?: unknown } | null)?.build
    return typeof build === 'string' && build !== '' ? build : null
  } catch {
    return null
  }
}

/**
 * 更新の有無を判定する。
 * 現在のビルドIDが不明な場合（開発ビルド等）は、誤検知を避けて常に false。
 */
export function isUpdateAvailable(current: string | undefined, latest: string | null): boolean {
  if (!current || !latest) return false
  return current !== latest
}

export interface UpdateWatcherOptions {
  /** 自分に焼き込まれたビルドID */
  currentBuildId: string | undefined
  /** 更新を検知したときに1回だけ呼ばれる */
  onUpdateAvailable: () => void
  /** テスト用の差し替え */
  fetchImpl?: typeof fetch
  intervalMs?: number
}

/**
 * 更新監視を開始する。戻り値を呼ぶと監視を停止する。
 *
 * 契機は2つ:
 *  - visibilitychange でアプリが前面に戻ったとき（standalone で放置されたアプリはここで必ず拾える）
 *  - 保険の定期チェック
 * 一度検知したら監視を止める（バナーは出しっぱなしになるため再通知は不要）。
 */
export function startUpdateWatcher(options: UpdateWatcherOptions): () => void {
  const {
    currentBuildId,
    onUpdateAvailable,
    fetchImpl = fetch,
    intervalMs = UPDATE_CHECK_INTERVAL_MS,
  } = options

  // ビルドIDが無い環境（開発サーバー）では監視しない
  if (!currentBuildId) return () => {}

  let stopped = false
  let checking = false

  const stop = () => {
    if (stopped) return
    stopped = true
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  const check = async () => {
    if (stopped || checking) return
    checking = true
    try {
      const latest = await fetchLatestBuildId(fetchImpl)
      if (!stopped && isUpdateAvailable(currentBuildId, latest)) {
        stop()
        onUpdateAvailable()
      }
    } finally {
      checking = false
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void check()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  const timer = window.setInterval(() => void check(), intervalMs)

  return stop
}
