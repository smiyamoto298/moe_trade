import { describe, it, expect } from 'vitest'
import { manualChunks, packageNameOf, REACT_VENDOR } from './manualChunks'

const nm = (pkg: string, file = 'index.js') => `/app/node_modules/${pkg}/${file}`

describe('packageNameOf', () => {
  it('node_modules のパッケージ名を取り出す', () => {
    expect(packageNameOf(nm('axios', 'dist/axios.js'))).toBe('axios')
  })

  it('スコープ付きパッケージは @scope/name まで取り出す', () => {
    expect(packageNameOf(nm('@remix-run/router', 'dist/router.js'))).toBe('@remix-run/router')
  })

  it('Windows のパス区切りでも取り出せる', () => {
    expect(packageNameOf('C:\\Dev\\moe_trade\\frontend\\node_modules\\react\\index.js')).toBe('react')
  })

  it('アプリ自身のソースは undefined', () => {
    expect(packageNameOf('/app/src/pages/ListingsPage.tsx')).toBeUndefined()
  })
})

describe('manualChunks', () => {
  it.each(REACT_VENDOR)('%s は react-vendor チャンクへ入れる', (pkg) => {
    expect(manualChunks(nm(pkg))).toBe('react-vendor')
  })

  it('axios は専用チャンクへ分ける', () => {
    expect(manualChunks(nm('axios', 'dist/axios.js'))).toBe('axios')
  })

  /*
   * ここが本題の回帰防止。パッケージ名を部分一致で判定すると `react-smooth` /
   * `react-is` のような recharts の依存まで react-vendor に取り込まれ、
   * 遅延読み込みしている重いチャート（LineChart チャンク）が初回バンドルへ戻ってしまう。
   */
  it.each(['react-smooth', 'react-is', 'recharts', 'lodash', 'd3-scale'])(
    '%s は初回バンドルへ引き戻さない（既定の分割に任せる）',
    (pkg) => {
      expect(manualChunks(nm(pkg))).toBeUndefined()
    }
  )

  it('アプリ自身のソースは既定の分割に任せる', () => {
    expect(manualChunks('/app/src/pages/MyPage.tsx')).toBeUndefined()
  })
})
