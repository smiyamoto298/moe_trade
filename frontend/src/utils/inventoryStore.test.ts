import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InventoryData } from '../types'

// inventoryApi をモックして、DBモードの分割保存（サーバ送信分とローカル分の振り分け）を検証する。
const replace = vi.fn()
const get = vi.fn()
vi.mock('../api/inventory', () => ({
  inventoryApi: {
    replace: (...args: unknown[]) => replace(...args),
    get: (...args: unknown[]) => get(...args),
    setMode: vi.fn(),
  },
}))

import {
  saveInventory,
  loadInventory,
  getDisplayType,
  setDisplayType,
  getServerExcludedNames,
  setServerExcludedNames,
  LOCAL_DB_SPLIT_KEY,
} from './inventoryStore'

const baseData = (): InventoryData => ({
  accounts: [{ id: 'a1', name: 'メイン' }],
  items: [
    { id: 'i1', accountId: 'a1', no: '1', name: '炎の剣', category: '武器', count: 1, itemId: 10, item: null, worn: false, dyed: false, marked: false, note: '' },
    { id: 'i2', accountId: 'a1', no: '2', name: '日記', category: '', count: 1, itemId: null, item: null, worn: false, dyed: false, marked: false, note: '' },
  ],
  exclusions: [],
})

describe('inventoryStore - 表示種別タブの永続化', () => {
  beforeEach(() => localStorage.clear())

  it('既定は取引可能、設定すると往復できる', () => {
    expect(getDisplayType()).toBe('tradeable')
    setDisplayType('all')
    expect(getDisplayType()).toBe('all')
    setDisplayType(5)
    expect(getDisplayType()).toBe(5)
    setDisplayType('unset')
    expect(getDisplayType()).toBe('unset')
  })
})

describe('inventoryStore - サーバ登録対象外名の永続化', () => {
  beforeEach(() => localStorage.clear())

  it('保存・取得できる', () => {
    expect(getServerExcludedNames()).toEqual([])
    setServerExcludedNames(['日記', '秘密のメモ'])
    expect(getServerExcludedNames()).toEqual(['日記', '秘密のメモ'])
  })
})

describe('inventoryStore - DBモードの分割保存', () => {
  beforeEach(() => {
    localStorage.clear()
    replace.mockReset()
    get.mockReset()
    replace.mockResolvedValue({ data: { storage_mode: 'db', accounts: [], items: [], exclusions: [] } })
  })

  it('サーバ登録対象外の行はサーバーへ送らずローカル（分割）へ保存する', async () => {
    const data = baseData()
    await saveInventory('db', data, new Set(['日記']))

    // サーバーへは「炎の剣」だけ送られる（「日記」は除外）
    const payload = replace.mock.calls[0][0]
    expect(payload.items.map((i: { name: string }) => i.name)).toEqual(['炎の剣'])

    // 「日記」はローカル分割保存に入る（アカウント名も保持）
    const split = JSON.parse(localStorage.getItem(LOCAL_DB_SPLIT_KEY) ?? '[]')
    expect(split).toHaveLength(1)
    expect(split[0].name).toBe('日記')
    expect(split[0]._accountName).toBe('メイン')
  })

  it('読込時にローカル分割保存分をDBスナップショットへマージする', async () => {
    // 事前に「日記」を分割保存しておく
    await saveInventory('db', baseData(), new Set(['日記']))

    // サーバーは「炎の剣」だけ返す
    get.mockResolvedValue({
      data: {
        storage_mode: 'db',
        accounts: [{ id: 100, name: 'メイン', sort_order: 0 }],
        items: [{ id: 1, moe_account_id: 100, item_id: 10, no: '1', name: '炎の剣', category: '武器', count: 1, price: null, is_worn: false, is_dyed: false, is_marked: false, note: null, sort_order: 0, item: null }],
        exclusions: [],
      },
    })

    const merged = await loadInventory('db')
    const names = merged.items.map((i) => i.name).sort()
    expect(names).toEqual(['日記', '炎の剣'].sort())
    // 「日記」はアカウント名「メイン」→ サーバーの新ID(100)へ対応づく
    const diary = merged.items.find((i) => i.name === '日記')!
    expect(diary.accountId).toBe('100')
  })

  it('localモードでは分割保存をクリアする', async () => {
    await saveInventory('db', baseData(), new Set(['日記']))
    expect(localStorage.getItem(LOCAL_DB_SPLIT_KEY)).not.toBeNull()
    await saveInventory('local', baseData())
    expect(localStorage.getItem(LOCAL_DB_SPLIT_KEY)).toBeNull()
  })
})
