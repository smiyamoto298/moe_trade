import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ItemDetailModal from './ItemDetailModal'
import { itemsApi } from '../api/items'
import type { Item, ItemPriceAnalytics } from '../types'

// design.md「アイテムボックス > 行ごとの情報・操作」:
// 紐づけ済み行のアイテム名クリックで、アイテム詳細（/items/:id 相当の情報）を
// ポップアップ表示する共通モーダル。基本情報・ハッシュタグ（読み取り専用）・相場を表示し、
// フッターの「詳細ページを開く」リンクは新しいタブで恒久ページへ導線する。

vi.mock('../api/items', () => ({ itemsApi: { get: vi.fn(), priceAnalytics: vi.fn() } }))
// recharts を含む重い相場チャートはスタブ化する
vi.mock('./PriceAnalyticsAsync', () => ({ default: () => <div data-testid="price-analytics" /> }))

const mockedGet = vi.mocked(itemsApi.get)
const mockedAnalytics = vi.mocked(itemsApi.priceAnalytics)

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: 12,
  category: { id: 11, parent_id: 1, name: '刀剣', sort_order: 1 },
  name: '炎の大剣',
  description: '',
  image_url: null,
  official_url: null,
  base_stats: {},
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

const makeAnalytics = (): ItemPriceAnalytics => ({
  item_id: 12,
  stats: { min: 100, max: 300, avg: 200, median: 200, deal_count: 3, listing_count: 1 },
  history: [],
  recent_deals: [],
  recent_listings: [],
})

describe('ItemDetailModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('アイテム情報を取得して名前・カテゴリと詳細ページへのリンクを表示する', async () => {
    mockedGet.mockResolvedValue({ data: makeItem() })
    mockedAnalytics.mockResolvedValue({ data: makeAnalytics() })

    render(<ItemDetailModal itemId={12} onClose={vi.fn()} />)

    expect(await screen.findByText('炎の大剣')).toBeInTheDocument()
    expect(screen.getByText('刀剣')).toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledWith(12)

    // 相場（PriceAnalytics）も表示される
    expect(await screen.findByTestId('price-analytics')).toBeInTheDocument()

    // 詳細ページへのリンクは新しいタブで開く（アイテムボックスの未保存編集を失わないため）
    const link = screen.getByTitle('アイテム詳細ページを新しいタブで開く')
    expect(link).toHaveAttribute('href', '/items/12')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('確認中（unverified）のアイテムには確認中バッジを表示する', async () => {
    mockedGet.mockResolvedValue({ data: makeItem({ verified_status: 'unverified' }) })
    mockedAnalytics.mockResolvedValue({ data: makeAnalytics() })

    render(<ItemDetailModal itemId={12} onClose={vi.fn()} />)

    await screen.findByText('炎の大剣')
    expect(screen.getByText(/確認中/)).toBeInTheDocument()
  })

  it('ハッシュタグがあれば読み取り専用で表示する', async () => {
    mockedGet.mockResolvedValue({
      data: makeItem({ hashtags: [{ id: 1, tag: '初心者向け', is_fixed: false }] }),
    })
    mockedAnalytics.mockResolvedValue({ data: makeAnalytics() })

    render(<ItemDetailModal itemId={12} onClose={vi.fn()} />)

    await screen.findByText('炎の大剣')
    expect(screen.getByText('ハッシュタグ')).toBeInTheDocument()
    expect(screen.getByText(/初心者向け/)).toBeInTheDocument()
  })

  it('相場の取得に失敗しても詳細表示は続行する', async () => {
    mockedGet.mockResolvedValue({ data: makeItem() })
    mockedAnalytics.mockRejectedValue(new Error('fail'))

    render(<ItemDetailModal itemId={12} onClose={vi.fn()} />)

    expect(await screen.findByText('炎の大剣')).toBeInTheDocument()
    expect(screen.queryByTestId('price-analytics')).not.toBeInTheDocument()
  })

  it('アイテムの取得に失敗したらエラーメッセージを表示する', async () => {
    mockedGet.mockRejectedValue(new Error('fail'))
    mockedAnalytics.mockResolvedValue({ data: makeAnalytics() })

    render(<ItemDetailModal itemId={12} onClose={vi.fn()} />)

    expect(await screen.findByText('アイテム情報の取得に失敗しました。')).toBeInTheDocument()
  })

  it('✕ ボタンとオーバーレイのクリックで onClose を呼ぶ', async () => {
    mockedGet.mockResolvedValue({ data: makeItem() })
    mockedAnalytics.mockResolvedValue({ data: makeAnalytics() })
    const onClose = vi.fn()

    render(<ItemDetailModal itemId={12} onClose={onClose} />)
    await screen.findByText('炎の大剣')

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    // モーダル本体のクリックでは閉じない（stopPropagation）
    fireEvent.click(screen.getByText('炎の大剣'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('itemId が変わったら再取得する', async () => {
    mockedGet.mockResolvedValue({ data: makeItem() })
    mockedAnalytics.mockResolvedValue({ data: makeAnalytics() })

    const { rerender } = render(<ItemDetailModal itemId={12} onClose={vi.fn()} />)
    await screen.findByText('炎の大剣')

    mockedGet.mockResolvedValue({ data: makeItem({ id: 34, name: '光の杖' }) })
    rerender(<ItemDetailModal itemId={34} onClose={vi.fn()} />)

    await waitFor(() => expect(mockedGet).toHaveBeenLastCalledWith(34))
    expect(await screen.findByText('光の杖')).toBeInTheDocument()
  })
})
