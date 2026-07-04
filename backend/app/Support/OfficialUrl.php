<?php

namespace App\Support;

/**
 * 公式DB（MasterOfEpic公式サイト moepic.com）リンクの正規化。
 *
 * 公式サイトのページ内リンクは <a href="javascript:Move('url','hidden_key')"> 形式で、
 * formcontrol.js の Move() が form2 に hidden_key をセットして POST する。
 * 同じページは GET の ?hidden_key=... でも開けるため、ユーザーが「リンクをコピー」で
 * 貼り付けた javascript:Move(...) を通常の URL に変換して保存する
 * （javascript: URL をそのまま保存すると XSS の温床になるため保存しない）。
 */
class OfficialUrl
{
    /**
     * javascript:Move('URL','KEY') 形式なら「URL?hidden_key=KEY」へ変換して返す。
     * それ以外（通常の URL・変換不能な相対パス等）は入力をそのまま返し、
     * 後段の officialUrlRule バリデーション（url 形式・moepic.com ホスト）に委ねる。
     */
    public static function normalize(?string $value): ?string
    {
        if (!is_string($value)) {
            return $value;
        }

        if (!preg_match(
            '/^javascript:\s*Move\(\s*([\'"])(.+?)\1\s*,\s*([\'"])(.*?)\3\s*\)\s*;?\s*$/i',
            trim($value),
            $m
        )) {
            return $value;
        }

        [, , $url, , $key] = $m;

        if (str_starts_with($url, '//')) {
            // プロトコル相対（//host/path）
            $url = 'https:' . $url;
        } elseif (str_starts_with($url, '/')) {
            // ルート相対（/top/news_detail.php 等）。公式DBは moepic.com 限定なので
            // 公式サイトのオリジンで解決できる
            $url = 'https://moepic.com' . $url;
        } elseif (!preg_match('~^https?://~i', $url)) {
            // ディレクトリ相対（例: 'news_detail.php'）は元ページが分からず
            // 解決できないため変換しない（バリデーションで通常のエラーになる）
            return $value;
        }

        if ($key === '') {
            return $url;
        }

        return $url . (str_contains($url, '?') ? '&' : '?') . 'hidden_key=' . rawurlencode($key);
    }
}
