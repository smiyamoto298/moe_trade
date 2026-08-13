/* MoE Trade — Web Push 用 Service Worker
 * サーバーからのプッシュ（title / body / url の JSON ペイロード）を通知として表示し、
 * クリックで既存タブがあればフォーカスして遷移、無ければ新しいウィンドウで開く。 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

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
      icon: '/img/favicon.jpg',
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
