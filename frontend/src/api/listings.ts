import client from './client'
import { USE_MOCK, mockListings } from './mock'
import type { Listing, ListingSearchParams, Paginated } from '../types'

export interface ListingCreatePayload {
  item_id: number
  price: number
  currency: string
  quantity: number
  trade_type: string
  comment: string
  is_worn?: boolean
  is_dyed?: boolean
  servers: { server: string; character_id: number | null }[]
}

export const listingsApi = {
  list: (params: ListingSearchParams): Promise<{ data: Paginated<Listing> }> => {
    if (USE_MOCK) return Promise.resolve({ data: mockListings })
    return client.get<Paginated<Listing>>('/listings', { params })
  },

  get: (id: number): Promise<{ data: Listing }> => {
    if (USE_MOCK) {
      const found = mockListings.data.find((l) => l.id === id)
      if (found) return Promise.resolve({ data: found })
    }
    return client.get<Listing>(`/listings/${id}`)
  },

  create: (data: ListingCreatePayload) => client.post<Listing>('/listings', data),

  update: (id: number, data: Partial<ListingCreatePayload>) =>
    client.put<Listing>(`/listings/${id}`, data),

  cancel: (id: number) =>
    client.delete(`/listings/${id}`),

  renew: (id: number) =>
    client.post(`/listings/${id}/renew`),
}
