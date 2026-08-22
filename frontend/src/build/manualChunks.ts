/*
 * ビルド時のチャンク分割ルール（`vite.config.ts` の rollupOptions.output.manualChunks 本体）。
 *
 * ビルド設定だがロジックを持つため、`tsc` と Vitest の対象である `src/` 配下に置いて
 * 回帰テスト（manualChunks.test.ts）を効かせる。アプリ側のどのモジュールからも
 * import していないので、production バンドルには含まれない。
 */

/**
 * 初回描画に必ず要る依存。まとめて `react-vendor` チャンクへ切り出す。
 * アプリのコードとは更新頻度が違うため、機能追加のたびにアプリ側チャンクの
 * ハッシュだけが変わり、これらはブラウザキャッシュに残り続ける。
 *
 * ここに足してよいのは「初回描画で必ず要るもの」だけ。recharts など遅延読み込み側の
 * 依存を混ぜると初回バンドルに引き戻されるので入れないこと。
 */
export const REACT_VENDOR = [
  'react',
  'react-dom',
  'scheduler',
  'react-router',
  'react-router-dom',
  '@remix-run/router',
]

/**
 * モジュール ID から node_modules のパッケージ名を取り出す。
 * Windows のパス区切りでも拾えるよう正規化し、スコープ付き（`@scope/name`）にも対応する。
 * node_modules 外（アプリ自身のソース）は undefined を返す。
 */
export function packageNameOf(id: string): string | undefined {
  return id.split('\\').join('/').match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]
}

/**
 * 依存ライブラリを固定チャンクへ振り分ける。アプリ側のモジュールと、
 * ここで指定しない依存は undefined を返して Rollup の既定の分割に任せる
 * （＝ recharts などは遅延読み込みのチャンクに入ったまま）。
 *
 * パッケージ名の完全一致で判定する。パス断片の部分一致にすると
 * `react-smooth`（recharts の依存）のような別パッケージまで巻き込み、
 * 遅延側の依存を初回バンドルへ引き戻してしまう。
 */
export function manualChunks(id: string): string | undefined {
  const pkg = packageNameOf(id)
  if (!pkg) return undefined
  if (REACT_VENDOR.includes(pkg)) return 'react-vendor'
  if (pkg === 'axios') return 'axios'
  return undefined
}
