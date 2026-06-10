<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Models\Item;
use App\Models\TradeChat;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuyRequestChatApiTest extends TestCase
{
    use RefreshDatabase;

    /** 買取（買いたい）を作成する。user_id は買い手。 */
    private function makeBuyRequest(?User $buyer = null, ?Item $item = null, array $attributes = []): BuyRequest
    {
        $buyer ??= $this->makeUser();
        $item  ??= $this->makeItem();

        $buyRequest = BuyRequest::create(array_merge([
            'user_id'    => $buyer->id,
            'item_id'    => $item->id,
            'price'      => 500,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'expires_at' => now()->addDays(7),
        ], $attributes));

        $buyRequest->servers()->create(['server' => 'Emerald']);

        return $buyRequest;
    }

    public function test_買取に売却を申し出るとチャットが作成される(): void
    {
        $buyer  = $this->makeUser();
        $seller = $this->makeUser();
        $buyRequest = $this->makeBuyRequest($buyer);

        $res = $this->actingAs($seller, 'sanctum')->postJson("/api/buy-requests/{$buyRequest->id}/chats", [
            'server'         => 'Emerald',
            'preferred_time' => '夜',
            'note'           => '売ります',
        ]);

        $res->assertStatus(201);
        $this->assertStringContainsString('売ります', $res->json('messages.0.message'));
    }

    public function test_自分の買取には取引希望できない(): void
    {
        $buyer = $this->makeUser();
        $buyRequest = $this->makeBuyRequest($buyer);

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/buy-requests/{$buyRequest->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(400);
    }

    public function test_買取の取引成立で履歴が記録される(): void
    {
        $buyer  = $this->makeUser();   // 買取登録者（買い手・owner）
        $seller = $this->makeUser();   // 売却を申し出た側（売り手・相手）
        $item   = $this->makeItem();
        $buyRequest = $this->makeBuyRequest($buyer, $item);

        // 売り手が売却を申し出る（取引希望）→ チャット作成
        $res = $this->actingAs($seller, 'sanctum')
            ->postJson("/api/buy-requests/{$buyRequest->id}/chats", ['server' => 'Emerald']);
        $res->assertStatus(201);
        $chatId = $res->json('id');

        // 取引希望のIP（売り手側）を別IPに設定して有効判定を検証
        TradeChat::find($chatId)->update(['request_ip' => '203.0.113.5']);

        // 買取登録者（owner=買い手）が取引成立にする
        $this->actingAs($buyer, 'sanctum')->postJson("/api/chats/{$chatId}/deal")->assertOk();

        // 買取由来の履歴が記録される。役割は反転（seller=申し出た側 / buyer=買取登録者）。
        $this->assertDatabaseHas('trade_history', [
            'buy_request_id' => $buyRequest->id,
            'listing_id'     => null,
            'item_id'        => $item->id,
            'seller_id'      => $seller->id,
            'buyer_id'       => $buyer->id,
            'seller_ip'      => '203.0.113.5', // 取引希望（売り手）のIP
            'buyer_ip'       => '127.0.0.1',   // 取引成立（買い手）のIP
            'price'          => 500,
            'is_valid'       => true,
        ]);

        // 買取・チャットのステータス
        $this->assertSame('completed', $buyRequest->fresh()->status);
        $this->assertSame('deal', TradeChat::find($chatId)->status);
    }

    public function test_買取の取引希望と成立が同一IPなら相場データは無効(): void
    {
        $buyer  = $this->makeUser();
        $seller = $this->makeUser();
        $buyRequest = $this->makeBuyRequest($buyer);

        $res = $this->actingAs($seller, 'sanctum')
            ->postJson("/api/buy-requests/{$buyRequest->id}/chats", ['server' => 'Emerald']);
        $chatId = $res->json('id');

        // 取引希望IP（127.0.0.1）と取引成立IP（127.0.0.1）が同一 → 無効
        $this->actingAs($buyer, 'sanctum')->postJson("/api/chats/{$chatId}/deal")->assertOk();

        $this->assertDatabaseHas('trade_history', [
            'buy_request_id' => $buyRequest->id,
            'is_valid'       => false,
        ]);
    }
}
