<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Models\Item;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuyRequestApiTest extends TestCase
{
    use RefreshDatabase;

    /** 買取（買いたい）を作成する。user_id は買い手。 */
    private function makeBuyRequest(?Item $item = null, array $attributes = []): BuyRequest
    {
        $buyer = $this->makeUser();
        $item ??= $this->makeItem();

        $buyRequest = BuyRequest::create(array_merge([
            'user_id'    => $buyer->id,
            'item_id'    => $item->id,
            'price'      => 500,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'expires_at' => now()->addMonth(),
        ], $attributes));

        $buyRequest->servers()->create(['server' => 'Emerald']);

        return $buyRequest;
    }

    public function test_active_でも期限切れの買取は一覧に出ない(): void
    {
        // バッチが走る前（status は active のまま）でも、期限超過は一覧から除外される
        $live    = $this->makeBuyRequest(null, ['expires_at' => now()->addDay()]);
        $expired = $this->makeBuyRequest(null, ['status' => 'active', 'expires_at' => now()->subHour()]);

        $res = $this->getJson('/api/buy-requests')->assertOk();

        $ids = collect($res->json('data'))->pluck('id')->all();
        $this->assertContains($live->id, $ids);
        $this->assertNotContains($expired->id, $ids);
    }

    public function test_active_でも期限切れの買取詳細は404(): void
    {
        $expired = $this->makeBuyRequest(null, ['status' => 'active', 'expires_at' => now()->subHour()]);

        $this->getJson("/api/buy-requests/{$expired->id}")->assertNotFound();
    }

    public function test_買取一覧を価格でソートできる(): void
    {
        $this->makeBuyRequest(null, ['price' => 100]);
        $this->makeBuyRequest(null, ['price' => 5000]);
        $this->makeBuyRequest(null, ['price' => 90000]);

        $res = $this->getJson('/api/buy-requests?sort=price_asc');
        $this->assertSame([100, 5000, 90000], array_column($res->json('data'), 'price'));

        $res = $this->getJson('/api/buy-requests?sort=price_desc');
        $this->assertSame([90000, 5000, 100], array_column($res->json('data'), 'price'));
    }

    public function test_買取一覧をあいうえお順でソートできる(): void
    {
        $cats = $this->makeCategoryTree();
        $this->makeBuyRequest($this->makeItem(['name' => 'さくら', 'category_id' => $cats['sword']->id]));
        $this->makeBuyRequest($this->makeItem(['name' => 'あんず', 'category_id' => $cats['sword']->id]));
        $this->makeBuyRequest($this->makeItem(['name' => 'かえで', 'category_id' => $cats['sword']->id]));

        // 昇順（あいうえお順）
        $res = $this->getJson('/api/buy-requests?sort=name_asc');
        $names = collect($res->json('data'))->pluck('item.name')->all();
        $this->assertSame(['あんず', 'かえで', 'さくら'], $names);

        // 降順
        $res = $this->getJson('/api/buy-requests?sort=name_desc');
        $names = collect($res->json('data'))->pluck('item.name')->all();
        $this->assertSame(['さくら', 'かえで', 'あんず'], $names);
    }

    public function test_renewで期限が延長されactiveに戻る(): void
    {
        $buyRequest = $this->makeBuyRequest(null, [
            'status'     => 'expired',
            'expires_at' => now()->subDay(),
        ]);

        $this->actingAs($buyRequest->user, 'sanctum')
            ->postJson("/api/buy-requests/{$buyRequest->id}/renew")
            ->assertOk();

        $fresh = $buyRequest->fresh();
        $this->assertSame('active', $fresh->status);
        $this->assertTrue($fresh->expires_at->gt(now()->addDays(20)));
    }

    public function test_renewで価格と取引方法を変更して再登録できる(): void
    {
        $buyRequest = $this->makeBuyRequest(null, [
            'status'     => 'expired',
            'expires_at' => now()->subDay(),
            'price'      => 500,
            'trade_type' => 'fixed',
        ]);

        $this->actingAs($buyRequest->user, 'sanctum')
            ->postJson("/api/buy-requests/{$buyRequest->id}/renew", [
                'price'      => 1200,
                'trade_type' => 'negotiable',
            ])
            ->assertOk();

        $fresh = $buyRequest->fresh();
        $this->assertSame('active', $fresh->status);
        $this->assertSame(1200, $fresh->price);
        $this->assertSame('negotiable', $fresh->trade_type);
    }

    public function test_renewの価格は1以上の整数のみ許可(): void
    {
        $buyRequest = $this->makeBuyRequest(null, [
            'status'     => 'expired',
            'expires_at' => now()->subDay(),
        ]);

        $this->actingAs($buyRequest->user, 'sanctum')
            ->postJson("/api/buy-requests/{$buyRequest->id}/renew", ['price' => 0])
            ->assertStatus(422);
    }

    public function test_値下げ再登録は新着扱いになり新着順で先頭へ来る(): void
    {
        // 期限切れの古い買取 A と、後から登録された有効な買取 B
        $a = $this->makeBuyRequest(null, ['price' => 1000, 'status' => 'expired', 'expires_at' => now()->subDay()]);
        \App\Models\BuyRequest::where('id', $a->id)->update(['created_at' => now()->subHours(2)]);
        $b = $this->makeBuyRequest(null, ['price' => 2000]);

        // 値下げして再登録 → A が「新着扱い」で先頭へ
        $this->actingAs($a->user, 'sanctum')
            ->postJson("/api/buy-requests/{$a->id}/renew", ['price' => 500])
            ->assertOk();

        $this->assertNotNull($a->fresh()->bumped_at);
        $ids = collect($this->getJson('/api/buy-requests')->json('data'))->pluck('id')->all();
        $this->assertSame([$a->id, $b->id], array_slice($ids, 0, 2));
    }
}
