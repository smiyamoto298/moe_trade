<?php

namespace App\Http\Controllers;

use App\Models\Item;

/**
 * アイテム恒久ページ（GET /items/{id}）をサーバ側でメタ注入して返す。
 *
 * アイテム名で検索したときの正規ランディング先。出品の有無に関わらず常に存在し、
 * 出品/買取詳細からの canonical 集約先になる。当該アイテムの <title>/description/OGP/
 * canonical/Product JSON-LD（未確認なら noindex）を注入する（仕組みは SpaPageController 参照）。
 */
class ItemPageController extends SpaPageController
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
        $description  = "マスターオブエピック（Master of Epic / MoE）「{$name}」（{$cat}）の相場・出品・買取情報。出品中の価格や取引履歴を確認できます。";
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
            'ogUrl'       => $url,
            'canonical'   => $url,
            'noindex'     => $noindex,
            'jsonLd'      => $jsonLd,
        ]);

        return response($html, 200)
            ->header('Content-Type', 'text/html; charset=UTF-8');
    }
}
