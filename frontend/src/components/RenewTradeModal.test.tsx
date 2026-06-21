import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RenewTradeModal from './RenewTradeModal'
import type { Listing } from '../types'

// 回帰: モーダルの暗幕は body 直下にポータル描画し、親の space-y-* が付ける
// margin-top で fixed オーバーレイが下にずれてヘッダー（メニュー）が覆われない不具合を防ぐ。
vi.mock('../api/listings', () => ({ listingsApi: { renew: vi.fn() } }))
vi.mock('../api/buyRequests', () => ({ buyRequestsApi: { renew: vi.fn() } }))

const record = {
  id: 1,
  price: 1000,
  trade_type: 'fixed',
  currency: 'G',
  item: { name: 'テストアイテム' },
} as unknown as Listing

describe('RenewTradeModal はポータルで描画される', () => {
  it('space-y-* の親要素の中ではなく body 直下に描画される', () => {
    render(
      <div data-testid="page" className="space-y-6">
        <RenewTradeModal kind="listing" record={record} onClose={vi.fn()} onSaved={vi.fn()} />
      </div>
    )

    const heading = screen.getByText('価格を設定してください')
    // 親（space-y-6）の子孫ではない＝兄弟マージンの影響を受けない
    expect(screen.getByTestId('page')).not.toContainElement(heading)
    // 暗幕（fixed inset-0）が body 直下にある
    const overlay = heading.closest('.fixed')
    expect(overlay?.parentElement).toBe(document.body)
  })
})
