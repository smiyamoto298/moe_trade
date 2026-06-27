import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TradeRequestPanel from './TradeRequestPanel'

// 入力中に他ユーザーがより有利な額で入札した場合の挙動を回帰として固定する。
// サーバーは current_price/best_bid 付きの 400 を返し、パネルは現在価格を更新して
// その額を添えたエラーを表示し、一覧へリダイレクトせず再入札できるようにする。

const getOrCreate = vi.fn()
vi.mock('../api/chat', () => ({ chatApi: { getOrCreate: (...a: unknown[]) => getOrCreate(...a), sendMessage: vi.fn() } }))
vi.mock('../api/buyRequests', () => ({ buyRequestsApi: { createChat: vi.fn() } }))
vi.mock('../api/characters', () => ({ charactersApi: { upsert: vi.fn() } }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { characters: [{ id: 1, server: 'Emerald', character_name: 'Me', is_default: true }] },
    refresh: vi.fn(),
  }),
}))

const source = {
  id: 1,
  servers: [{ server: 'Emerald' as const, character: { character_name: 'Me' } }],
  trade_type: 'auction' as const,
  price: 1000,
  currency: 'AC',
  buyout_price: null,
  current_price: 1200,
  best_bid: 1200,
}

describe('TradeRequestPanel（オークション入札中に抜かれた場合）', () => {
  beforeEach(() => {
    getOrCreate.mockReset()
  })

  it('他ユーザーが上回ると現在の入札額を添えてエラー表示し、現在価格を更新する', async () => {
    getOrCreate.mockRejectedValue({
      response: { status: 400, data: { message: '入札額は…', best_bid: 1500, current_price: 1500 } },
    })

    render(<TradeRequestPanel source={source} onComplete={vi.fn()} onCancel={vi.fn()} />)

    // サーバー選択 → 1300 で入札（現在の最高 1200 より高く一旦は有効）
    fireEvent.click(screen.getByRole('radio'))
    const bidInput = screen.getByRole('spinbutton')
    fireEvent.change(bidInput, { target: { value: '1300' } })
    fireEvent.click(screen.getByRole('button', { name: '入札する' }))

    // 現在の入札額（1,500）を添えたエラーが出る
    expect(await screen.findByText(/現在の入札額は 1,500 AC/)).toBeInTheDocument()
    // 現在価格の表示と必要入札額（プレースホルダ）が最新値 1,500 / 1,501 に更新される
    expect(bidInput.getAttribute('placeholder')).toContain('1,501')
  })
})
