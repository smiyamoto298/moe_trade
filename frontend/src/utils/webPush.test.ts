import { describe, expect, it } from 'vitest'
import { isWebPushSupported, subscribeWebPush, urlBase64ToUint8Array } from './webPush'

describe('urlBase64ToUint8Array', () => {
  it('base64url をバイト列へ変換できる', () => {
    // 'AQID' = base64 で [1, 2, 3]
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3])
  })

  it('base64url 特有の文字（- _）を扱える', () => {
    // '__79' → base64 '//79' = [0xff, 0xfe, 0xfd]
    expect(Array.from(urlBase64ToUint8Array('__79'))).toEqual([0xff, 0xfe, 0xfd])
  })

  it('パディング無しの長さでも変換できる', () => {
    // 'AQI' → 'AQI=' = [1, 2]
    expect(Array.from(urlBase64ToUint8Array('AQI'))).toEqual([1, 2])
  })
})

describe('subscribeWebPush', () => {
  it('Web Push 未対応環境（jsdom）では false を返す', async () => {
    expect(isWebPushSupported()).toBe(false)
    await expect(subscribeWebPush()).resolves.toBe(false)
  })
})
