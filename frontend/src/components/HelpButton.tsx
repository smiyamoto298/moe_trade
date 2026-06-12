import { useTour } from '../tours/TourContext'

// 画面右下に常設する「?」ヘルプボタン。
// 現在のページに案内ツアーがある場合のみ表示し、押すとそのページのツアーを再生します。
export default function HelpButton() {
  const { hasTourForCurrentPath, startCurrentPageTour, activePageId } = useTour()

  // ツアーが無いページ、または再生中は非表示
  if (!hasTourForCurrentPath || activePageId) return null

  return (
    <button
      onClick={() => startCurrentPageTour()}
      title="このページの使い方を見る"
      aria-label="このページの使い方を見る"
      className="fixed bottom-24 sm:bottom-20 min-[1150px]:bottom-16 right-5 z-[900] w-11 h-11 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-lg font-bold shadow-lg flex items-center justify-center transition-colors"
    >
      ?
    </button>
  )
}
