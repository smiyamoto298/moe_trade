<?php

namespace App\Http\Controllers;

use App\Models\Item;

/**
 * アイテム恒久ページ（GET /items/{id}）をサーバ側でメタ注入して返す。
 *
 * SPA の index.html は全URLで同一の汎用 <title>/description しか持たないため、
 * クローラーは JS レンダリング前の生HTMLでは個々のアイテムを区別できず
 * 「クロール済み・未登録」に滞留しやすい。そこで本番では /items/{id} だけ Laravel が
 * 受け、ビルド済み index.html に当該アイテムの <title>/description/OGP/canonical/
 * Product JSON-LD（未確認なら noindex）を流し込んでから返す。これにより生HTMLの段階で
 * アイテムごとに固有のメタが揃い、インデックスされやすくなる（design.md「SEO」参照）。
 *
 * 注入する canonical / robots / JSON-LD は usePageMeta.ts と同じ data-page-* マーカーを
 * 付ける。React 起動後に usePageMeta が removeManaged で同マーカーを除去してから再設定する
 * ため、ハイドレーション後も canonical 等が二重化しない。
 */
class ItemPageController extends Controller
{
    public function __invoke(int $id)
    {
        $item = Item::with('category')->find($id);
        $html = $this->loadTemplate();

        // 存在しないアイテムは 404 を返し、検索エンジンに「無いページ」と伝える。
        // SPA シェルは返すのでクライアント側ルーターが not-found 表示を行う。
        if (!$item) {
            return response($html, 404)
                ->header('Content-Type', 'text/html; charset=UTF-8');
        }

        $origin = rtrim(config('app.frontend_url'), '/');
        $url    = "{$origin}/items/{$item->id}";
        $name   = (string) $item->name;
        $cat    = (string) ($item->category->name ?? '');

        $title       = "{$name} の相場・出品 | MoE Trade";
        $description  = "Master of Epic「{$name}」（{$cat}）の相場・出品・買取情報。出品中の価格や取引履歴を確認できます。";
        $noindex      = $item->verified_status === 'unverified';

        $jsonLd = array_filter([
            '@context' => 'https://schema.org',
            '@type'    => 'Product',
            'name'     => $name,
            'category' => $cat,
            'brand'    => ['@type' => 'Brand', 'name' => 'Master of Epic'],
            'url'      => $url,
            'description' => $item->description ?: null,
            'image'    => $item->image_url ?: null,
        ], fn ($v) => $v !== null);

        $html = $this->injectMeta($html, [
            'title'       => $title,
            'description' => $description,
            'url'         => $url,
            'noindex'     => $noindex,
            'jsonLd'      => $jsonLd,
        ]);

        return response($html, 200)
            ->header('Content-Type', 'text/html; charset=UTF-8');
    }

    /**
     * ビルド済み SPA シェル（backend/public/index.html）を読む。
     * 未ビルド環境（テスト等）では注入対象を備えた最小シェルにフォールバックする。
     */
    private function loadTemplate(): string
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
     * SPA シェルにアイテム固有のメタを流し込む。値は htmlspecialchars / JSON_HEX_TAG で
     * エスケープし、ユーザー投稿（未確認アイテム名等）による属性・タグ・script 注入を防ぐ。
     */
    private function injectMeta(string $html, array $m): string
    {
        $e = fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

        // <title>
        $html = preg_replace('/<title>.*?<\/title>/su', '<title>' . $e($m['title']) . '</title>', $html, 1);

        // 既存の name/property メタの content を差し替える
        $html = $this->setMetaContent($html, 'name', 'description', $m['description'], $e);
        $html = $this->setMetaContent($html, 'property', 'og:title', $m['title'], $e);
        $html = $this->setMetaContent($html, 'property', 'og:description', $m['description'], $e);
        $html = $this->setMetaContent($html, 'property', 'og:url', $m['url'], $e);
        $html = $this->setMetaContent($html, 'name', 'twitter:title', $m['title'], $e);
        $html = $this->setMetaContent($html, 'name', 'twitter:description', $m['description'], $e);

        // canonical / robots / JSON-LD を </head> 直前へ追加（usePageMeta と同じマーカー付き）
        $add = '    <link rel="canonical" data-page-canonical href="' . $e($m['url']) . '" />' . "\n";
        if ($m['noindex']) {
            $add .= '    <meta name="robots" data-page-robots content="noindex" />' . "\n";
        }
        $json = json_encode(
            $m['jsonLd'],
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP
        );
        $add .= '    <script type="application/ld+json" data-page-jsonld>' . $json . '</script>' . "\n";

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
