import { describe, expect, it } from 'vitest'
import { buildPushGuide } from './pushGuide'

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

describe('buildPushGuide', () => {
  it('通知API非対応のiPhoneではホーム画面に追加する手順を案内する', () => {
    const guide = buildPushGuide(false, { ua: IOS_UA, standalone: false })
    expect(guide.title).toBe('プッシュ通知を利用するには')
    expect(guide.message).toContain('ホーム画面に追加')
    expect(guide.highlight).toContain('iOS 16.4')
  })

  it('通知API非対応のその他ブラウザでは対応ブラウザの利用を案内する', () => {
    const guide = buildPushGuide(false, { ua: DESKTOP_UA, standalone: false })
    expect(guide.message).toContain('対応していません')
  })

  it('AndroidでブロックされているときはChromeのサイト設定手順を案内する', () => {
    const guide = buildPushGuide(true, { ua: ANDROID_UA, standalone: false })
    expect(guide.title).toBe('通知ブロックの解除方法')
    expect(guide.message).toContain('Android Chrome')
    expect(guide.highlight).toContain('再読み込み')
  })

  it('iPhoneのホーム画面アプリでブロックされているときは設定アプリの手順を案内する', () => {
    const guide = buildPushGuide(true, { ua: IOS_UA, standalone: true })
    expect(guide.message).toContain('「設定」アプリ')
    expect(guide.message).toContain('通知を許可')
  })

  it('PCブラウザでブロックされているときはサイト情報アイコンからの解除を案内する', () => {
    const guide = buildPushGuide(true, { ua: DESKTOP_UA, standalone: false })
    expect(guide.message).toContain('アドレスバー左の鍵')
  })
})
