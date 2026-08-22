import { useEffect, useState } from 'react'
import {
  isInstallAvailable,
  isInstallDismissed,
  isRunningStandalone,
  markInstallDismissed,
  promptInstall,
  subscribeInstallAvailability,
} from '../utils/installPrompt'

/**
 * ホーム画面へのインストールを促すバナー（ヘッダー直下）。
 *
 * Chrome がインストール条件を満たしたと判断したときだけ beforeinstallprompt が飛ぶため、
 * 非対応ブラウザ・インストール済み・条件未達の環境では何も表示されない。
 * iOS Safari は JS からホーム画面追加を起動できないため対象外。
 */
export default function InstallAppButton() {
  const [available, setAvailable] = useState(() => isInstallAvailable())
  const [dismissed, setDismissed] = useState(() => isInstallDismissed())

  useEffect(() => subscribeInstallAvailability(setAvailable), [])

  if (!available || dismissed || isRunningStandalone()) return null

  const handleInstall = async () => {
    const accepted = await promptInstall()
    // 拒否された場合もイベントは使い切りなのでバナーは消える（次回訪問時に再度飛ぶ）
    if (accepted) setDismissed(true)
  }

  const handleDismiss = () => {
    markInstallDismissed()
    setDismissed(true)
  }

  return (
    <div className="bg-emerald-900/40 border-t border-emerald-600/50 text-emerald-100 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>📲 MoE Trade をホーム画面に追加すると、アプリのように起動できます。</span>
        <button
          onClick={handleInstall}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded transition-colors"
        >
          インストール
        </button>
        <button
          onClick={handleDismiss}
          className="underline text-emerald-200 hover:text-white transition-colors"
        >
          あとで
        </button>
      </div>
    </div>
  )
}
