<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 買取詳細ページ（GET /buy-requests/{id}）のサーバ側メタ注入。
 * 生HTMLの段階で固有の title/description と canonical（アイテム恒久ページへの集約）が入り、
 * 非公開（取り下げ・期限切れ）は本物の 404 を返すこと（ソフト404対策）を検証する。
 */
class BuyRequestPageTest extends TestCase
{
    use RefreshDatabase;

    /** 買取（買いたい）を作成する。 */
    private function makeBuyRequest(?Item $item = null, array $attributes = []): BuyRequest
    {
        $buyRequest = BuyRequest::create(array_merge([
            'user_id'    => $this->makeUser()->id,
            'item_id'    => ($item ?? $this->makeItem())->id,
            'price'      => 500,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'expires_at' => now()->addDays(7),
        ], $attributes));

        $buyRequest->servers()->create(['server' => 'Emerald']);

        return $buyRequest;
    }

    public function test_買取中の買取は固有のメタとアイテムページへのcanonicalが注入される(): void
    {
        $base = rtrim(config('app.frontend_url'), '/');
        $item = $this->makeItem(['name' => '氷の盾']);
        $buyRequest = $this->makeBuyRequest($item);

        $res = $this->get("/buy-requests/{$buyRequest->id}");

        $res->assertOk();
        $res->assertHeader('Content-Type', 'text/html; charset=UTF-8');
        $html = $res->getContent();

        $this->assertStringContainsString('<title>氷の盾 の買取 | MoE Trade</title>', $html);
        // ゲーム名の表記ゆれ（カタカナ・英語）を description に含め、ブランド系検索でも拾われるようにする
        $this->assertStringContainsString('マスターオブエピック', $html);
        $this->assertStringContainsString('Master of Epic', $html);
        // canonical は使い捨ての買取URLでなくアイテム恒久ページへ集約（usePageMeta と同じマーカー）
        $this->assertStringContainsString('rel="canonical" data-page-canonical href="' . $base . '/items/' . $item->id . '"', $html);
        // og:url は共有用にこのページ自身のURL
        $this->assertStringContainsString('property="og:url" content="' . $base . '/buy-requests/' . $buyRequest->id . '"', $html);
    }

    public function test_取り下げた買取は404でSPAシェルを返す(): void
    {
        $buyRequest = $this->makeBuyRequest(null, ['status' => 'cancelled']);

        $res = $this->get("/buy-requests/{$buyRequest->id}");

        $res->assertStatus(404);
        $res->assertHeader('Content-Type', 'text/html; charset=UTF-8');
        $this->assertStringContainsString('<div id="root">', $res->getContent());
    }

    public function test_バッチ未実行でactiveのまま期限超過した買取も404を返す(): void
    {
        $buyRequest = $this->makeBuyRequest(null, ['expires_at' => now()->subDay()]);

        $this->get("/buy-requests/{$buyRequest->id}")->assertStatus(404);
    }

    public function test_存在しない買取は404でSPAシェルを返す(): void
    {
        $this->get('/buy-requests/999999')->assertStatus(404);
    }
}
