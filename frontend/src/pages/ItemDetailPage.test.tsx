import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import ItemDetailPage from './ItemDetailPage'
import { itemsApi } from '../api/items'
import { DEFAULT_TITLE, SITE_ORIGIN } from '../hooks/usePageMeta'
import type { Item, ItemPriceAnalytics } from '../types'

// design.md「SEO」:
// アイテムの恒久公開ページ /items/:id は、アイテム名検索の正規ランディング先。
// title/description にアイテム名を含め、canonical を自URLに、JSON-LD(Product)を出力する。
// 未確認(unverified)アイテムは noindex でインデックスから除外する。

vi.mock('../api/items', () => ({
  itemsApi: { get: vi.fn(), priceAnalytics: vi.fn() },
}))
// 重いチャート本体は描画しない（相場枠の存在のみ検証）
vi.mock('../components/PriceAnalyticsAsync', () => ({ default: () => <div data-testid="price-analytics" /> }))

const mockedGet = vi.mocked(itemsApi.get)
const mockedPriceAnalytics = vi.mocked(itemsApi.priceAnalytics)

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: 12,
  category: { id: 11, parent_id: 1, name: '刀剣', sort_order: 1 },
  name: '炎の大剣',
  description: '燃え盛る刀身の大剣。',
  image_url: null,
  official_url: null,
  base_stats: { atk: 100 },
  special_conditions: [],
  dyeable: null,
  mithril: false,
  is_equipment_set: false,
  set_piece_category_ids: null,
  skill_requirements: null,
  mastery_requirements: null,
  verified_status: 'verified',
  submitted_by: null,
  locked_by_staff: false,
  bonus_effects: [],
  ...over,
})

const analytics: ItemPriceAnalytics = {
  item_id: 12,
  stats: { min: 1000, max: 5000, avg: 3000, median: 3000, deal_count: 4, listing_count: 2 },
  history: [],
  recent_deals: [],
  recent_listings: [],
}

function renderAt(id = 12) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[`/items/${id}`]}>
        <Routes>
          <Route path="/items/:id" element={<ItemDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

const canonicalHref = () =>
  document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
const jsonLd = () => {
  const el = document.head.querySelector('script[type="application/ld+json"]')
  return el ? JSON.parse(el.textContent ?? '{}') : null
}
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content')

describe('ItemDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.title = DEFAULT_TITLE
    document.head.querySelectorAll('[data-page-canonical],[data-page-jsonld],[data-page-robots]').forEach((e) => e.remove())
    mockedPriceAnalytics.mockResolvedValue({ data: analytics })
  })

  it('アイテム名を見出し・タイトル・canonical・JSON-LD に設定する', async () => {
    mockedGet.mockResolvedValue({ data: makeItem() })
    renderAt()

    expect(await screen.findByRole('heading', { name: '炎の大剣' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('炎の大剣 の相場・出品 | MoE Trade'))

    expect(canonicalHref()).toBe(`${SITE_ORIGIN}/items/12`)

    const ld = jsonLd()
    expect(ld['@type']).toBe('Product')
    expect(ld.name).toBe('炎の大剣')
    expect(ld.url).toBe(`${SITE_ORIGIN}/items/12`)

    // 確認済みアイテムは noindex を付けない
    expect(robots()).toBeUndefined()
  })

  it('相場（価格解析）枠を表示する', async () => {
    mockedGet.mockResolvedValue({ data: makeItem() })
    renderAt()

    expect(await screen.findByTestId('price-analytics')).toBeInTheDocument()
  })

  it('未確認アイテムは noindex でインデックス対象から外す', async () => {
    mockedGet.mockResolvedValue({ data: makeItem({ verified_status: 'unverified' }) })
    renderAt()

    await screen.findByRole('heading', { name: '炎の大剣' })
    await waitFor(() => expect(robots()).toBe('noindex'))
  })

  it('存在しないアイテムは見つからない旨を表示する', async () => {
    mockedGet.mockRejectedValue(new Error('404'))
    renderAt(999)

    expect(await screen.findByText(/見つかりませんでした/)).toBeInTheDocument()
  })
})
