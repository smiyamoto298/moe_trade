<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Models\Item;
use App\Models\TradeChat;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 取引希望の取り下げ（登録者が無応答のとき）のテスト。
 *
 * 取引希望を送った側（buyer_id）は、取引対象の登録者(owner)から
 * TradeChat::WITHDRAW_AFTER_DAYS 日間まったく返信が無い場合に限り、
 * マイ取引から自分の取引希望を取り下げ（declined）できる。
 */
class TradeWithdrawTest extends TestCase
{
    use RefreshDatabase;

    /** 出品への取引希望チャットを作る。 */
    private function makeChat(User $seller, User $buyer, array $attributes = []): TradeChat
    {
        $listing = $this->makeListing($seller);

        return TradeChat::create(array_merge([
            'listing_id' => $listing->id,
            'buyer_id'   => $buyer->id,
            'server'     => 'Emerald',
            'status'     => 'open',
        ], $attributes));
    }

    /** 買取（買いたい）を作成する。user_id は買い手＝owner。 */
    private function makeBuyRequest(User $owner, ?Item $item = null): BuyRequest
    {
        $buyRequest = BuyRequest::create([
            'user_id'    => $owner->id,
            'item_id'    => ($item ?? $this->makeItem())->id,
            'price'      => 500,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'expires_at' => now()->addDays(7),
        ]);
        $buyRequest->servers()->create(['server' => 'Emerald']);

        return $buyRequest;
    }

    public function test_取引希望の直後は取り下げできない(): void
    {
        $buyer = $this->makeUser();
        $chat  = $this->makeChat($this->makeUser(), $buyer);

        $res = $this->actingAs($buyer, 'sanctum')->postJson("/api/chats/{$chat->id}/decline");

        $res->assertStatus(400);
        $this->assertNotNull($res->json('withdrawable_at'));
        $this->assertSame('open', $chat->fresh()->status);
    }

    public function test_登録者から返信がないまま規定日数が過ぎると取り下げできる(): void
    {
        $buyer = $this->makeUser();
        $chat  = $this->makeChat($this->makeUser(), $buyer);

        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS)->days();

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/decline")
            ->assertOk();

        $this->assertSame('declined', $chat->fresh()->status);
    }

    public function test_自分が何度メッセージを送っても取り下げ可能時刻は延びない(): void
    {
        $buyer = $this->makeUser();
        $chat  = $this->makeChat($this->makeUser(), $buyer);

        // 待っている間に自分から催促しても、起点（登録者の無応答開始）は動かない
        $this->travel(2)->days();
        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/messages", ['message' => 'ご確認お願いします'])
            ->assertStatus(201);

        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS - 2)->days();
        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/decline")
            ->assertOk();

        $this->assertSame('declined', $chat->fresh()->status);
    }

    public function test_登録者が返信するとそこから数え直しになる(): void
    {
        $seller = $this->makeUser();
        $buyer  = $this->makeUser();
        $chat   = $this->makeChat($seller, $buyer);

        // 規定日数の直前に登録者が返信 → 取り下げ不可に戻る
        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS)->days();
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/messages", ['message' => 'お待たせしました'])
            ->assertStatus(201);

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/decline")
            ->assertStatus(400);
        $this->assertSame('open', $chat->fresh()->status);

        // 返信からさらに規定日数が過ぎれば取り下げできる
        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS)->days();
        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/decline")
            ->assertOk();
        $this->assertSame('declined', $chat->fresh()->status);
    }

    public function test_順番待ちでも規定日数が過ぎれば取り下げでき次が繰り上がる(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeListing($seller);
        $first   = TradeChat::create([
            'listing_id' => $listing->id, 'buyer_id' => $this->makeUser()->id,
            'server' => 'Emerald', 'status' => 'open',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $secondBuyer = $this->makeUser();
        $second = TradeChat::create([
            'listing_id' => $listing->id, 'buyer_id' => $secondBuyer->id,
            'server' => 'Emerald', 'status' => 'open',
            'created_at' => now()->addSecond(), 'updated_at' => now()->addSecond(),
        ]);

        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS)->days();

        // 順番待ち（2番目）でも自分の取引希望は取り下げられる
        $this->actingAs($secondBuyer, 'sanctum')
            ->postJson("/api/chats/{$second->id}/decline")
            ->assertOk();

        $this->assertSame('declined', $second->fresh()->status);
        $this->assertSame('open', $first->fresh()->status);
        $this->assertTrue($first->fresh()->isFirstInQueue());
    }

    public function test_オークションの入札は日数が経っても取り下げできない(): void
    {
        $seller  = $this->makeUser();
        $bidder  = $this->makeUser();
        $listing = $this->makeListing($seller, null, [
            'trade_type' => 'auction',
            'expires_at' => now()->addDays(30),
        ]);
        $chat = TradeChat::create([
            'listing_id' => $listing->id,
            'buyer_id'   => $bidder->id,
            'server'     => 'Emerald',
            'status'     => 'open',
            'bid_price'  => 1500,
        ]);

        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS + 10)->days();

        $this->actingAs($bidder, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/decline")
            ->assertStatus(400);
        $this->assertSame('open', $chat->fresh()->status);
    }

    public function test_登録者の見送りは日数に関係なくできる(): void
    {
        $seller = $this->makeUser();
        $chat   = $this->makeChat($seller, $this->makeUser());

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/decline")
            ->assertOk();
        $this->assertSame('declined', $chat->fresh()->status);
    }

    public function test_チャット詳細に取り下げ可否が付く(): void
    {
        $seller = $this->makeUser();
        $buyer  = $this->makeUser();
        $chat   = $this->makeChat($seller, $buyer);

        $res = $this->actingAs($buyer, 'sanctum')->getJson("/api/chats/{$chat->id}");
        $res->assertOk();
        $this->assertFalse($res->json('can_withdraw'));
        $this->assertNotNull($res->json('withdrawable_at'));

        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS)->days();
        $this->assertTrue(
            $this->actingAs($buyer, 'sanctum')->getJson("/api/chats/{$chat->id}")->json('can_withdraw')
        );

        // 登録者側には取り下げ可否は付かない（取り下げるのは取引希望者だけ）
        $this->assertNull(
            $this->actingAs($seller, 'sanctum')->getJson("/api/chats/{$chat->id}")->json('can_withdraw')
        );
    }

    public function test_マイ取引の取引希望一覧に取り下げ可否が付く(): void
    {
        $buyer = $this->makeUser();
        $chat  = $this->makeChat($this->makeUser(), $buyer);

        $this->assertFalse(
            $this->actingAs($buyer, 'sanctum')->getJson('/api/mypage/chats')->json('0.can_withdraw')
        );

        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS)->days();
        $res = $this->actingAs($buyer, 'sanctum')->getJson('/api/mypage/chats');
        $res->assertOk();
        $this->assertSame($chat->id, $res->json('0.id'));
        $this->assertTrue($res->json('0.can_withdraw'));
    }

    public function test_マイ取引の販売希望一覧に取り下げ可否が付き取り下げできる(): void
    {
        $owner      = $this->makeUser();
        $offerer    = $this->makeUser();
        $buyRequest = $this->makeBuyRequest($owner);
        $chat = TradeChat::create([
            'buy_request_id' => $buyRequest->id,
            'buyer_id'       => $offerer->id,
            'server'         => 'Emerald',
            'status'         => 'open',
        ]);

        $this->assertFalse(
            $this->actingAs($offerer, 'sanctum')->getJson('/api/mypage/selling-offers')->json('0.can_withdraw')
        );

        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS)->days();
        $this->assertTrue(
            $this->actingAs($offerer, 'sanctum')->getJson('/api/mypage/selling-offers')->json('0.can_withdraw')
        );

        $this->actingAs($offerer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/decline")
            ->assertOk();
        $this->assertSame('declined', $chat->fresh()->status);
    }

    public function test_当事者以外は取り下げできない(): void
    {
        $chat  = $this->makeChat($this->makeUser(), $this->makeUser());
        $other = $this->makeUser();

        $this->travel(TradeChat::WITHDRAW_AFTER_DAYS)->days();

        $this->actingAs($other, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/decline")
            ->assertStatus(403);
        $this->assertSame('open', $chat->fresh()->status);
    }
}
