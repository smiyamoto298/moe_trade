/**
 * 公式DB（MasterOfEpic公式サイト moepic.com）リンクの正規化。
 *
 * 公式サイトのページ内リンクは <a href="javascript:Move('url','hidden_key')"> 形式で、
 * サイト側の Move() がフォームに hidden_key をセットして POST する。
 * 同じページは GET の ?hidden_key=... でも開けるため、ユーザーが「リンクをコピー」で
 * 貼り付けた javascript:Move(...) を通常の URL に変換する
 * （javascript: URL をそのまま保存すると XSS の温床になるため保存しない）。
 * バックエンド（App\Support\OfficialUrl）にも同じ変換があり、こちらは入力時の即時変換用。
 */
export function normalizeOfficialUrl(value: string): string {
  const m = value
    .trim()
    .match(/^javascript:\s*Move\(\s*(['"])(.+?)\1\s*,\s*(['"])(.*?)\3\s*\)\s*;?\s*$/i)
  if (!m) return value

  let url = m[2]
  const key = m[4]

  if (url.startsWith('//')) {
    // プロトコル相対（//host/path）
    url = 'https:' + url
  } else if (url.startsWith('/')) {
    // ルート相対（/top/news_detail.php 等）。公式DBは moepic.com 限定なので公式サイトのオリジンで解決できる
    url = 'https://moepic.com' + url
  } else if (!/^https?:\/\//i.test(url)) {
    // ディレクトリ相対（例: 'news_detail.php'）は元ページが分からず解決できない
    return value
  }

  if (!key) return url
  return url + (url.includes('?') ? '&' : '?') + 'hidden_key=' + encodeURIComponent(key)
}
