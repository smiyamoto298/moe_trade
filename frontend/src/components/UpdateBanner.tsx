import { useEffect, useState } from 'react'
import { startUpdateWatcher } from '../utils/appUpdate'
import { BUILD_ID } from '../utils/buildId'

/**
 * サイトが更新されたことを検知して再読み込みを促すバナー（ヘッダー直下）。
 *
 * ホーム画面のアプリ（standalone）はユーザーが閉じないため、古い JS のまま
 * 何日も動き続けて新しい API を叩く事故が起きやすい。長時間開いたままのタブにも有効。
 */
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false)

  useEffect(
    () =>
      startUpdateWatcher({
        currentBuildId: BUILD_ID,
        onUpdateAvailable: () => setAvailable(true),
      }),
    []
  )

  if (!available) return null

  return (
    <div className="bg-primary-900/50 border-t border-primary-500/50 text-primary-100 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>✨ 新しいバージョンがあります。</span>
        <button
          onClick={() => window.location.reload()}
          className="bg-primary-500 hover:bg-primary-600 text-white px-3 py-1 rounded transition-colors"
        >
          更新する
        </button>
      </div>
    </div>
  )
}
