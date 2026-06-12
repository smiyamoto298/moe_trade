import { Suspense, lazy } from 'react'
import Spinner from './Spinner'
import type { ItemPriceAnalytics } from '../types'

// recharts（グラフ描画ライブラリ）を含む重いチャートコードを別チャンクに分割し、
// 価格解析が実際に表示されるまで読み込まない。利用側はこのラッパーを import する。
const PriceAnalytics = lazy(() => import('./PriceAnalytics'))

export default function PriceAnalyticsAsync({ analytics }: { analytics: ItemPriceAnalytics }) {
  return (
    <Suspense fallback={<Spinner />}>
      <PriceAnalytics analytics={analytics} />
    </Suspense>
  )
}
