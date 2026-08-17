import { useState } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import { useDialog } from '../contexts/DialogContext'
import { isRunningStandalone } from '../utils/installPrompt'
import { buildPushGuide } from '../utils/pushGuide'

/**
 * PWA（ホーム画面アプリ）起動時に、通知がブロックされていることを知らせる警告バナー（ヘッダー直下）。
 *
 * standalone 起動はアドレスバーが無く、ブラウザのように鍵アイコンから通知の許可状態を
 * 確認できない。特に iOS は Safari で許可した通知がアプリへ引き継がれず、インストール直後に
 * 気づかないままブロック状態になりやすいため、起動時に明示して解除手順の案内へ誘導する。
 * サイト側の設定で自ら通知をOFFにしている人には出さない（本人の意思によるOFFのため）。
 */
export default function PushBlockedBanner() {
  const { notifPermission, notifSupported, pushOptedOut } = useNotification()
  const { alert } = useDialog()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || !isRunningStandalone()) return null
  if (!notifSupported || notifPermission !== 'denied' || pushOptedOut) return null

  return (
    <div className="bg-amber-900/40 border-t border-amber-700/50 text-amber-100 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>🔕 通知がブロックされているため、プッシュ通知は届きません。</span>
        <button
          onClick={() => {
            const guide = buildPushGuide(true)
            alert(guide.message, { title: guide.title, highlight: guide.highlight })
          }}
          className="bg-amber-700/60 hover:bg-amber-600/60 text-white px-3 py-1 rounded transition-colors"
        >
          解除方法
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="閉じる"
          className="ml-auto text-amber-200/80 hover:text-white px-1 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
