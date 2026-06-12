import { describe, it, expect } from 'vitest'
import { saveToken, getToken, removeToken } from './client'

// 認証トークンは localStorage（auth_token）で保持する。
describe('トークン保存ヘルパー', () => {
  it('保存・取得・削除が一貫して動作する', () => {
    expect(getToken()).toBeNull()
    saveToken('token-123')
    expect(getToken()).toBe('token-123')
    expect(localStorage.getItem('auth_token')).toBe('token-123')
    removeToken()
    expect(getToken()).toBeNull()
  })
})
