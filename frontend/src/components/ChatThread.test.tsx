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
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
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

// design.md「取引チャット」: メッセージの編集は自分の最新メッセージのみ、
// 削除は最初の取引希望メッセージ以外の自分のメッセージのみ可能。
describe('ChatThread メッセージ編集・削除', () => {
  // user_id=2（買い手・currentUserId）の取引希望 → 出品者の返信 → 買い手の最新メッセージ
  const multiChat: TradeChat = {
    ...chat,
    messages: [
      { id: 1, chat_id: 1, user_id: 2, character_name: 'テスト買い手', message: '【希望時間帯】21時以降', created_at: '2026-06-12T10:00:00Z' },
      { id: 2, chat_id: 1, user_id: 1, character_name: '出品者', message: 'よろしくお願いします', created_at: '2026-06-12T10:01:00Z' },
      { id: 3, chat_id: 1, user_id: 2, character_name: 'テスト買い手', message: '了解です', created_at: '2026-06-12T10:02:00Z' },
    ],
  }

  beforeEach(() => {
    ;(chatApi.updateMessage as ReturnType<typeof vi.fn>).mockClear()
    ;(chatApi.deleteMessage as ReturnType<typeof vi.fn>).mockClear()
  })

  it('自分の最新メッセージにのみ「編集」を表示し、保存でAPIが呼ばれ本文が更新される', async () => {
    ;(chatApi.updateMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 3, chat_id: 1, user_id: 2, message: '了解です。20時に伺います' },
    })
    renderThread({ chat: multiChat })

    // 編集ボタンは1つだけ（最新の自分のメッセージのみ）
    const editButtons = screen.getAllByRole('button', { name: '編集' })
    expect(editButtons.length).toBe(1)

    fireEvent.click(editButtons[0])
    const input = screen.getByDisplayValue('了解です') as HTMLInputElement
    fireEvent.change(input, { target: { value: '了解です。20時に伺います' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(chatApi.updateMessage).toHaveBeenCalledWith(1, 3, '了解です。20時に伺います')
    })
    expect(await screen.findByText('了解です。20時に伺います')).toBeTruthy()
  })

  it('最初の取引希望メッセージには「削除」を表示せず、それ以外の自分のメッセージは削除できる', async () => {
    ;(chatApi.deleteMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { deleted: true } })
    renderThread({ chat: multiChat })

    // 削除ボタンは1つだけ（自分のメッセージ id=1 は先頭のため対象外、id=3 のみ）
    const deleteButtons = screen.getAllByRole('button', { name: '削除' })
    expect(deleteButtons.length).toBe(1)

    fireEvent.click(deleteButtons[0])
    // 確認ダイアログで「削除する」
    fireEvent.click(await screen.findByRole('button', { name: '削除する' }))

    await waitFor(() => {
      expect(chatApi.deleteMessage).toHaveBeenCalledWith(1, 3)
    })
    // 一覧から消える
    await waitFor(() => {
      expect(screen.queryByText('了解です')).toBeNull()
    })
  })

  it('相手のメッセージには編集・削除ボタンを表示しない', () => {
    // 出品者視点（currentUserId=1）。最新メッセージ(id=3)は相手のもの → 編集不可
    renderThread({ chat: multiChat, currentUserId: 1, isOwner: true })
    expect(screen.queryByRole('button', { name: '編集' })).toBeNull()
    // 自分（出品者）の id=2 は先頭以外なので削除は可能
    expect(screen.getAllByRole('button', { name: '削除' }).length).toBe(1)
  })

  it('クローズ済み（見送り）チャットでは編集・削除ボタンを表示しない', () => {
    renderThread({ chat: { ...multiChat, status: 'declined' as TradeChat['status'] } })
    expect(screen.queryByRole('button', { name: '編集' })).toBeNull()
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull()
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
