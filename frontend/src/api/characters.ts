import client from './client'
import { USE_MOCK } from './mock'
import type { UserCharacter, Server } from '../types'

// モック用の一時ストア（AuthContextのmockユーザーと同期）
import { mockUsers, MOCK_MY_USER_ID } from './mock'

function getMyChars() {
  return mockUsers.find((u) => u.id === MOCK_MY_USER_ID)!.characters
}

export const charactersApi = {
  upsert: (server: Server, character_name: string): Promise<{ data: UserCharacter }> => {
    if (USE_MOCK) {
      const chars = getMyChars()
      const existing = chars.find((c) => c.server === server)
      if (existing) {
        existing.character_name = character_name
        return Promise.resolve({ data: { ...existing } })
      }
      const newChar: UserCharacter = { id: Date.now(), server, character_name }
      chars.push(newChar)
      return Promise.resolve({ data: newChar })
    }
    return client.post<UserCharacter>('/characters', { server, character_name })
  },

  remove: (id: number): Promise<void> => {
    if (USE_MOCK) {
      const chars = getMyChars()
      const idx = chars.findIndex((c) => c.id === id)
      if (idx !== -1) chars.splice(idx, 1)
      return Promise.resolve()
    }
    return client.delete(`/characters/${id}`)
  },
}
