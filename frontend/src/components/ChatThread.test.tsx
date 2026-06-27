import type { ComponentProps } from 'react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChatThread from './ChatThread'
import { DialogProvider } from '../contexts/DialogContext'
import type { TradeChat } from '../types'

// design.md「取引チャット」: メッセージ本文は吹き出し幅（max-w-[75%]）内で
// 折り返して表示する。スペースを含まない長い文字列（URL 等）でも
// レイアウトが崩れないよう break-words で強制改行する。
// また、取引成立（deal）チャットにはTELLコマンドのコピーアイコンを表示し、
// 「/tell 取引相手のキャラクター名 」（末尾半角スペース付き）をコピーできる。

vi.mock('../api/chat', () => ({
  chatApi: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    sendMessage: vi.fn(),
    deal: vi.fn(),
    decline: vi.fn(),
    dealFailed: vi.fn(),
    markComplete: vi.fn(),
    bid: vi.fn(),
  },
}))

import { chatApi } from '../api/chat'

beforeAll(() => {
  // jsdom には scrollIntoView が無いためスタブする
  Element.prototype.scrollIntoView = vi.fn()
})

const longMessage = 'https://example.com/very/long/path/' + 'a'.repeat(300)

const chat: TradeChat = {
  id: 1,
  listing_id: 1,
  buyer_id: 2,
  buyer_character_name: 'テスト買い手',
  server: 'P' as TradeChat['server'],
  status: 'open' as TradeChat['status'],
  seller_completed: false,
  buyer_completed: false,
  messages: [
    {
      id: 1,
      chat_id: 1,
      user_id: 2,
      character_name: 'テスト買い手',
      message: longMessage,
      created_at: '2026-06-12T10:00:00Z',
    },
  ],
  created_at: '2026-06-12T10:00:00Z',
  updated_at: '2026-06-12T10:00:00Z',
}

const renderThread = (props: Partial<ComponentProps<typeof ChatThread>> = {}) =>
  render(
    <DialogProvider>
      <ChatThread chat={chat} currentUserId={2} isOwner={false} {...props} />
    </DialogProvider>
  )

describe('ChatThread', () => {
  it('長いメッセージの吹き出しに折り返し（break-words）と幅制限が指定されている', () => {
    renderThread()
    const bubble = screen.getByText(longMessage)
    expect(bubble.className).toContain('break-words')
    expect(bubble.className).toContain('max-w-[75%]')
  })
})

describe('ChatThread TELLコマンドコピー', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeAll(() => {
    // jsdom には clipboard が無いためスタブする
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  beforeEach(() => {
    writeText.mockClear()
  })

  const dealChat: TradeChat = { ...chat, status: 'deal' as TradeChat['status'] }

  it('取引成立チャットでは owner に「/tell 取引希望者キャラ名 」（末尾半角スペース付き）のコピーアイコンが表示される', async () => {
    renderThread({ chat: dealChat, currentUserId: 1, isOwner: true })
    const btn = screen.getByRole('button', { name: 'TELLコマンドをコピー' })
    // メッセージ表示領域の右下に固定表示する
    expect(btn.className).toContain('absolute')
    expect(btn.className).toContain('bottom-2')
    expect(btn.className).toContain('right-3')
    fireEvent.click(btn)
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('/tell テスト買い手 ')
    })
    // コピー済みフィードバックが表示される
    expect(await screen.findByText('✓ コピーしました')).toBeTruthy()
  })

  it('取引希望者側では取引対象のサーバー連絡先キャラ名で「/tell 」コマンドをコピーする', async () => {
    renderThread({
      chat: dealChat,
      currentUserId: 2,
      isOwner: false,
      source: {
        trade_type: 'fixed',
        price: 1000,
        servers: [
          { server: 'P', character: { character_name: '出品者キャラ' } },
          { server: 'E', character: { character_name: '別サーバーキャラ' } },
        ],
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'TELLコマンドをコピー' }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('/tell 出品者キャラ ')
    })
  })

  it('交渉中（open）のチャットにはTELLコマンドアイコンを表示しない', () => {
    renderThread()
    expect(screen.queryByRole('button', { name: 'TELLコマンドをコピー' })).toBeNull()
  })
})

// オークション（trade_type=auction）の入札・自動成立まわり
describe('ChatThread オークション', () => {
  const auctionSource = { trade_type: 'auction', price: 1000, buyout_price: 5000 }
  const bidChat: TradeChat = { ...chat, bid_price: 1100 }

  it('入札者には入札更新UIが表示され、より有利な額で更新できる', async () => {
    ;(chatApi.bid as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { ...bidChat, bid_price: 1500 } })
    renderThread({ chat: bidChat, currentUserId: 2, isOwner: false, source: auctionSource })

    // 現在の自分の入札が表示される
    expect(screen.getByText(/あなたの入札/)).toBeTruthy()

    const input = screen.getByPlaceholderText('現在より高い額') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: '入札を更新' }))

    await waitFor(() => {
      expect(chatApi.bid).toHaveBeenCalledWith(1, 1500)
    })
  })

  it('オークションの登録者(owner)には手動の「取引成立」「見送り」ボタンを表示しない', () => {
    renderThread({ chat: bidChat, currentUserId: 1, isOwner: true, source: auctionSource })
    expect(screen.queryByRole('button', { name: '取引成立' })).toBeNull()
    expect(screen.queryByRole('button', { name: '見送り' })).toBeNull()
    // 自動成立の案内を表示する
    expect(screen.getByText(/オークション（自動成立）/)).toBeTruthy()
  })
})
