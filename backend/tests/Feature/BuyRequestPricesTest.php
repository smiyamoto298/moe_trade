<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuyRequestPricesTest extends TestCase
{
    use RefreshDatabase;

    private function makeBuyRequest($user, $item, array $attrs = []): BuyRequest
    {
        return BuyRequest::create(array_merge([
            'user_id'    => $user->id,
            'item_id'    => $item->id,
            'price'      => 500,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'status'     => 'active',
            'expires_at' => now()->addDays(7),
        ], $attrs));
    }

    public function test_アイテムごとに最高額の募集中買取を返す(): void
    {
        $item  = $this->makeItem(['name' => '炎の剣']);
        $other = $this->makeItem(['name' => '氷の剣']);

        $this->makeBuyRequest($this->makeUser(), $item, ['price' => 300]);
        $high = $this->makeBuyRequest($this->makeUser(), $item, ['price' => 800]);
        // 非activeは対象外
        $this->makeBuyRequest($this->makeUser(), $item, ['price' => 9999, 'status' => 'completed']);

        $res = $this->postJson('/api/buy-requests/prices', [
            'item_ids' => [$item->id, $other->id],
        ])->assertOk();

        $res->assertJsonPath("{$item->id}.price", 800)
            ->assertJsonPath("{$item->id}.buy_request_id", $high->id)
            ->assertJsonPath("{$item->id}.currency", 'AC')
            // 募集中の買取は2件（completed は対象外）。最高値を採用しつつ件数も返す
            ->assertJsonPath("{$item->id}.count", 2);

        // 買取の無いアイテムはキーごと存在しない
        $this->assertArrayNotHasKey((string) $other->id, $res->json());
    }

    public function test_停止ユーザーの買取は除外される(): void
    {
        $item = $this->makeItem();
        $suspended = $this->makeUser(['is_suspended' => true]);
        $this->makeBuyRequest($suspended, $item, ['price' => 700]);

        $res = $this->postJson('/api/buy-requests/prices', ['item_ids' => [$item->id]])->assertOk();
        $this->assertArrayNotHasKey((string) $item->id, $res->json());
    }

    public function test_item_idsは必須(): void
    {
        $this->postJson('/api/buy-requests/prices', [])
            ->assertStatus(422)->assertJsonValidationErrors('item_ids');
    }
}
