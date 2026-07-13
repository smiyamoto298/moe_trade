<?php

namespace App\Http\Controllers;

use App\Models\Listing;

/**
 * 出品詳細ページ（GET /listings/{id}）をサーバ側でメタ注入して返す。
 *
 * 出品URLは期限切れで消える使い捨てのため、canonical はアイテム恒久ページ
 * /items/{item_id} へ集約する（ListingDetailPage.tsx と同じ）。閲覧可否は
 * 詳細API（ListingController::show）と同じ visible(['active','completed']) をミラーし、
 * 取り下げ・期限切れ等は本物の 404 を返す。生HTMLが全URL同一の 200 だと
 * Search Console で「ソフト404」「重複・非正規」になるのを防ぐ（design.md「SEO」参照）。
 */
class ListingPageController extends SpaPageController
{
    public function __invoke(int $id)
    {
        $listing = Listing::with('item')->visible(['active', 'completed'])->find($id);
        $html = $this->loadTemplate();

        if (!$listing) {
            return response($html, 404)
                ->header('Content-Type', 'text/html; charset=UTF-8');
        }

        $origin = rtrim(config('app.frontend_url'), '/');
        $name   = (string) $listing->item->name;

        $html = $this->injectMeta($html, [
            'title'       => "{$name} の出品 | MoE Trade",
            'description' => "マスターオブエピック（Master of Epic / MoE）「{$name}」の出品情報。価格・取引条件を確認して取引チャットで購入できます。",
            'ogUrl'       => "{$origin}/listings/{$listing->id}",
            'canonical'   => "{$origin}/items/{$listing->item_id}",
        ]);

        return response($html, 200)
            ->header('Content-Type', 'text/html; charset=UTF-8');
    }
}
