import { describe, it, expect, vi, beforeEach } from 'vitest'
import client from './client'
import { itemsApi } from './items'
import type { Item } from '../types'

// design.md「アイテム管理」: GET /items はページネーション（per_page 最大200）で返すため、
// itemsApi.list は last_page まで全ページを辿って結合する。
// 1ページ目しか使わないと 51件目以降のアイテムが管理画面・アイテム検索から消える
// （未確認バッジは別 API の全件カウントなので件数が食い違う）バグの回帰防止。

vi.mock('./client', () => ({
  default: { get: vi.fn() },
  saveToken: vi.fn(),
  getToken: vi.fn(() => null),
  removeToken: vi.fn(),
}))

const mockedGet = vi.mocked(client.get)

const makeItem = (id: number, name: string) => ({ id, name }) as unknown as Item

// ページごとのレスポンス（Laravel paginate 形式の必要部分のみ）
const pageResponse = (items: Item[], lastPage: number) =>
  Promise.resolve({ data: { data: items, last_page: lastPage } })

describe('itemsApi.list のページネーション', () => {
  beforeEach(() => {
    mockedGet.mockReset()
  })

  it('複数ページを全部辿って結合する', async () => {
    mockedGet.mockImplementation((_url, config) => {
      const page = (config?.params as { page: number }).page
      if (page === 1) return pageResponse([makeItem(1, '剣A'), makeItem(2, '剣B')], 3)
      if (page === 2) return pageResponse([makeItem(3, '剣C'), makeItem(4, '剣D')], 3)
      return pageResponse([makeItem(5, '剣E')], 3)
    })

    const res = await itemsApi.list({ name: '剣' })

    expect(res.data.map((i) => i.id)).toEqual([1, 2, 3, 4, 5])
    expect(mockedGet).toHaveBeenCalledTimes(3)
    // 検索条件を維持したまま per_page=200 でページを進める
    expect(mockedGet).toHaveBeenNthCalledWith(1, '/items', { params: { name: '剣', per_page: 200, page: 1 } })
    expect(mockedGet).toHaveBeenNthCalledWith(3, '/items', { params: { name: '剣', per_page: 200, page: 3 } })
  })

  it('1ページで収まる場合は追加リクエストしない', async () => {
    mockedGet.mockImplementation(() => pageResponse([makeItem(1, '剣A')], 1))

    const res = await itemsApi.list()

    expect(res.data).toHaveLength(1)
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  it('0件（last_page=1・data空）でも空配列を返す', async () => {
    mockedGet.mockImplementation(() => pageResponse([], 1))

    const res = await itemsApi.list({ name: '存在しない' })

    expect(res.data).toEqual([])
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})
