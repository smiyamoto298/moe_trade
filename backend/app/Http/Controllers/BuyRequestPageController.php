<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;

/**
 * 買取詳細ページ（GET /buy-requests/{id}）をサーバ側でメタ注入して返す。
 *
 * 買取URLは期限切れで消える使い捨てのため、canonical はアイテム恒久ページ
 * /items/{item_id} へ集約する（BuyRequestDetailPage.tsx と同じ）。閲覧可否は
 * 詳細API（BuyRequestController::show）と同じ visible(['active','completed']) をミラーし、
 * 取り下げ・期限切れ等は本物の 404 を返す。生HTMLが全URL同一の 200 だと
 * Search Console で「ソフト404」「重複・非正規」になるのを防ぐ（design.md「SEO」参照）。
 */
class BuyRequestPageController extends SpaPageController
{
    public function __invoke(int $id)
    {
        $buyRequest = BuyRequest::with('item')->visible(['active', 'completed'])->find($id);
        $html = $this->loadTemplate();

        if (!$buyRequest) {
            return response($html, 404)
                ->header('Content-Type', 'text/html; charset=UTF-8');
        }

        $origin = rtrim(config('app.frontend_url'), '/');
        $name   = (string) $buyRequest->item->name;

        $html = $this->injectMeta($html, [
            'title'       => "{$name} の買取 | MoE Trade",
            'description' => "マスターオブエピック（Master of Epic / MoE）「{$name}」の買取（買いたい）情報。価格・取引条件を確認して取引チャットで売却できます。",
            'ogUrl'       => "{$origin}/buy-requests/{$buyRequest->id}",
            'canonical'   => "{$origin}/items/{$buyRequest->item_id}",
        ]);

        return response($html, 200)
            ->header('Content-Type', 'text/html; charset=UTF-8');
    }
}
