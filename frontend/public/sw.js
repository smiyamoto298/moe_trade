/* MoE Trade — Service Worker
 *
 * 役割は2つ:
 *  1. Web Push（title / body / url の JSON ペイロード）を通知として表示し、
 *     クリックで既存タブがあればフォーカスして遷移、無ければ新しいウィンドウで開く。
 *  2. オフライン時のフォールバック表示。
 *
 * 2 について: Chrome はインストール可否の判定で「オフライン状態を模した fetch イベントを
 * SW に投げ、200 が返るか」を実際に検証する。そのため空の fetch ハンドラでは
 * beforeinstallprompt が発火せず、サイト内のインストールボタンを作れない。
 *
 * ただしキャッシュするのはオフライン用の1ページだけで、通常のリクエストは一切握らない
 * （ナビゲーションが「失敗したときだけ」キャッシュを見る）。
 * これにより index.html やアセットがキャッシュに固定されず、デプロイした内容は
 * 従来どおり即時反映される。
 */
const CACHE_NAME = 'moe-trade-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 旧バージョンのオフラインキャッシュを掃除する
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  // ページ遷移のみ対象。API・アセットは素通しでネットワークへ（キャッシュしない）
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request)
      } catch {
        const cached = await caches.match(OFFLINE_URL)
        return cached ?? Response.error()
      }
    })()
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* 不正なペイロードは既定表示にフォールバック */
  }
  const title = data.title || 'MoE Trade'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/img/icon-192.png',
      data: { url: data.url || '/mypage' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/mypage'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const win of wins) {
        if ('focus' in win) {
          win.navigate(url)
          return win.focus()
        }
      }
      return self.clients.openWindow(url)
    })()
  )
})
