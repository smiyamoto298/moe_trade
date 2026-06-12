import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChatThread from './ChatThread'
import { DialogProvider } from '../contexts/DialogContext'
import type { TradeChat } from '../types'

// design.md「取引チャット」: メッセージ本文は吹き出し幅（max-w-[75%]）内で
// 折り返して表示する。スペースを含まない長い文字列（URL 等）でも
// レイアウトが崩れないよう break-words で強制改行する。

vi.mock('../api/chat', () => ({
  chatApi: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    sendMessage: vi.fn(),
    deal: vi.fn(),
    decline: vi.fn(),
    dealFailed: vi.fn(),
    markComplete: vi.fn(),
  },
}))

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

const renderThread = () =>
  render(
    <DialogProvider>
      <ChatThread chat={chat} currentUserId={2} isOwner={false} />
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
