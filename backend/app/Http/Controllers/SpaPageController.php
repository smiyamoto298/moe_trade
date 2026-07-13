<?php

namespace App\Http\Controllers;

/**
 * SPA シェル（ビルド済み index.html）へページ固有のメタをサーバ側で注入する基底。
 *
 * SPA の index.html は全URLで同一の汎用 <title>/description しか持たないため、
 * クローラーは JS レンダリング前の生HTMLでは個々のページを区別できず
 * 「クロール済み・未登録」「重複」に滞留しやすい。そこで本番では対象URLだけ Laravel が
 * 受け、固有の <title>/description/OGP/canonical 等を流し込んでから返す
 * （design.md「SEO」参照）。対象: /items/{id}・/listings/{id}・/buy-requests/{id}。
 *
 * 注入する canonical / robots / JSON-LD は usePageMeta.ts と同じ data-page-* マーカーを
 * 付ける。React 起動後に usePageMeta が removeManaged で同マーカーを除去してから再設定する
 * ため、ハイドレーション後も canonical 等が二重化しない。
 */
abstract class SpaPageController extends Controller
{
    /**
     * ビルド済み SPA シェル（backend/public/index.html）を読む。
     * 未ビルド環境（テスト等）では注入対象を備えた最小シェルにフォールバックする。
     */
    protected function loadTemplate(): string
    {
        $path = public_path('index.html');
        if (is_file($path)) {
            return (string) file_get_contents($path);
        }

        return <<<'HTML'
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>MoE Trade — Master of Epic 取引所</title>
    <meta name="description" content="Master of Epic のアイテム取引所。" />
    <meta property="og:title" content="MoE Trade — Master of Epic 取引所" />
    <meta property="og:description" content="Master of Epic のアイテム取引所。" />
    <meta property="og:url" content="https://moe-trade.sakuraweb.com/" />
    <meta name="twitter:title" content="MoE Trade — Master of Epic 取引所" />
    <meta name="twitter:description" content="Master of Epic のアイテム取引所。" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
HTML;
    }

    /**
     * SPA シェルにページ固有のメタを流し込む。値は htmlspecialchars / JSON_HEX_TAG で
     * エスケープし、ユーザー投稿（未確認アイテム名等）による属性・タグ・script 注入を防ぐ。
     *
     * $m のキー:
     *   - title / description: <title>・description・OGP（og: と twitter: の各メタ）へ反映
     *   - ogUrl: og:url（共有されたときに出すそのページ自身のURL）
     *   - canonical: <link rel="canonical">。ogUrl と別URLにできる
     *     （出品/買取詳細は自URLを og:url、評価集約先のアイテム恒久ページを canonical にする）
     *   - noindex: true で <meta name="robots" content="noindex">
     *   - jsonLd: 構造化データの配列（null なら出力しない）
     */
    protected function injectMeta(string $html, array $m): string
    {
        $e = fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

        // <title>
        $html = preg_replace('/<title>.*?<\/title>/su', '<title>' . $e($m['title']) . '</title>', $html, 1);

        // 既存の name/property メタの content を差し替える
        $html = $this->setMetaContent($html, 'name', 'description', $m['description'], $e);
        $html = $this->setMetaContent($html, 'property', 'og:title', $m['title'], $e);
        $html = $this->setMetaContent($html, 'property', 'og:description', $m['description'], $e);
        $html = $this->setMetaContent($html, 'property', 'og:url', $m['ogUrl'], $e);
        $html = $this->setMetaContent($html, 'name', 'twitter:title', $m['title'], $e);
        $html = $this->setMetaContent($html, 'name', 'twitter:description', $m['description'], $e);

        // canonical / robots / JSON-LD を </head> 直前へ追加（usePageMeta と同じマーカー付き）
        $add = '    <link rel="canonical" data-page-canonical href="' . $e($m['canonical']) . '" />' . "\n";
        if (!empty($m['noindex'])) {
            $add .= '    <meta name="robots" data-page-robots content="noindex" />' . "\n";
        }
        if (!empty($m['jsonLd'])) {
            $json = json_encode(
                $m['jsonLd'],
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP
            );
            $add .= '    <script type="application/ld+json" data-page-jsonld>' . $json . '</script>' . "\n";
        }

        return preg_replace('/<\/head>/', $add . '</head>', $html, 1);
    }

    /** 指定した name/property を持つ <meta> の content 値だけを差し替える。 */
    private function setMetaContent(string $html, string $attr, string $key, string $value, callable $e): string
    {
        $pattern = '/<meta\s+' . preg_quote($attr, '/') . '="' . preg_quote($key, '/') . '"\s+content="[^"]*"\s*\/?>/i';
        $replacement = '<meta ' . $attr . '="' . $key . '" content="' . $e($value) . '" />';

        return preg_replace($pattern, $replacement, $html, 1);
    }
}
