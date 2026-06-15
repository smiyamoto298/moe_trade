<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SitemapTest extends TestCase
{
    use RefreshDatabase;

    /** 買取（買いたい）を作成する。 */
    private function makeBuyRequest(array $attributes = []): BuyRequest
    {
        $buyRequest = BuyRequest::create(array_merge([
            'user_id'    => $this->makeUser()->id,
            'item_id'    => $this->makeItem()->id,
            'price'      => 500,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'expires_at' => now()->addDays(7),
        ], $attributes));

        $buyRequest->servers()->create(['server' => 'Emerald']);

        return $buyRequest;
    }

    public function test_XMLとして返り一覧ページのURLを含む(): void
    {
        $base = rtrim(config('app.frontend_url'), '/');

        $res = $this->get('/sitemap.xml');

        $res->assertOk();
        $res->assertHeader('Content-Type', 'application/xml; charset=UTF-8');
        $this->assertStringContainsString('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', $res->getContent());
        // トップページ＋主要一覧ページ
        $this->assertStringContainsString("<loc>{$base}/</loc>", $res->getContent());
        foreach (['/listings', '/skills', '/assets', '/items', '/buy-requests'] as $path) {
            $this->assertStringContainsString("<loc>{$base}{$path}</loc>", $res->getContent());
        }
    }

    public function test_出品中の出品と買取中の買取の詳細URLが含まれる(): void
    {
        $base       = rtrim(config('app.frontend_url'), '/');
        $listing    = $this->makeListing();
        $buyRequest = $this->makeBuyRequest();

        $content = $this->get('/sitemap.xml')->getContent();

        $this->assertStringContainsString("<loc>{$base}/listings/{$listing->id}</loc>", $content);
        $this->assertStringContainsString("<loc>{$base}/buy-requests/{$buyRequest->id}</loc>", $content);
    }

    public function test_確認済みアイテムの恒久ページが含まれunverifiedは含まれない(): void
    {
        $base       = rtrim(config('app.frontend_url'), '/');
        $verified   = $this->makeItem(['name' => '確認済みの剣', 'verified_status' => 'verified']);
        $unverified = $this->makeItem(['name' => '未確認の剣', 'verified_status' => 'unverified']);

        $content = $this->get('/sitemap.xml')->getContent();

        // 出品が無くてもアイテムの恒久ページは列挙される（アイテム名検索の正規ランディング先）
        $this->assertStringContainsString("<loc>{$base}/items/{$verified->id}</loc>", $content);
        // 未確認アイテムは精査前のため出さない
        $this->assertStringNotContainsString("<loc>{$base}/items/{$unverified->id}</loc>", $content);
    }

    public function test_出品中以外の出品と買取は含まれない(): void
    {
        $base      = rtrim(config('app.frontend_url'), '/');
        $cancelled = $this->makeListing(null, null, ['status' => 'cancelled']);
        $expired   = $this->makeListing(null, null, ['status' => 'expired']);
        $completed = $this->makeListing(null, null, ['status' => 'completed']);
        $brExpired = $this->makeBuyRequest(['status' => 'expired']);

        $content = $this->get('/sitemap.xml')->getContent();

        $this->assertStringNotContainsString("<loc>{$base}/listings/{$cancelled->id}</loc>", $content);
        $this->assertStringNotContainsString("<loc>{$base}/listings/{$expired->id}</loc>", $content);
        $this->assertStringNotContainsString("<loc>{$base}/listings/{$completed->id}</loc>", $content);
        $this->assertStringNotContainsString("<loc>{$base}/buy-requests/{$brExpired->id}</loc>", $content);
    }
}
