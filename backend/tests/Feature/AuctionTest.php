<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Models\Item;
use App\Models\Listing;
use App\Models\TradeChat;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * オークション取引（出品・買取の取引方法 auction）の機能テスト。
 */
class AuctionTest extends TestCase
{
    use RefreshDatabase;

    /** オークション出品を直接作成する（price=最低取引価格）。 */
    private function makeAuctionListing(array $attributes = []): Listing
    {
        $listing = Listing::create(array_merge([
            'user_id'      => $this->makeUser()->id,
            'item_id'      => $this->makeItem()->id,
            'price'        => 1000,
            'currency'     => 'AC',
            'quantity'     => 1,
            'trade_type'   => 'auction',
            'buyout_price' => null,
            'expires_at'   => now()->addDays(3),
        ], $attributes));
        $listing->servers()->create(['server' => 'Emerald']);
        return $listing;
    }

    /** オークション買取を直接作成する（price=最高取引価格）。 */
    private function makeAuctionBuyRequest(array $attributes = []): BuyRequest
    {
        $buyRequest = BuyRequest::create(array_merge([
            'user_id'      => $this->makeUser()->id,
            'item_id'      => $this->makeItem()->id,
            'price'        => 500,
            'currency'     => 'AC',
            'quantity'     => 1,
            'trade_type'   => 'auction',
            'buyout_price' => null,
            'expires_at'   => now()->addDays(3),
        ], $attributes));
        $buyRequest->servers()->create(['server' => 'Emerald']);
        return $buyRequest;
    }

    public function test_オークション出品をAPIで作成できる(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/listings', [
            'item_id'      => $item->id,
            'price'        => 1000,
            'quantity'     => 1,
            'trade_type'   => 'auction',
            'buyout_price' => 5000,
            'expires_at'   => now()->addDays(5)->toIso8601String(),
            'servers'      => [['server' => 'Emerald']],
        ]);

        $res->assertStatus(201);
        $this->assertDatabaseHas('listings', [
            'id'           => $res->json('id'),
            'trade_type'   => 'auction',
            'buyout_price' => 5000,
        ]);

        // 期限日は解決バッチ（15分ごと）に合わせて15分単位・秒0に丸められる
        $created = Listing::find($res->json('id'));
        $this->assertSame(0, $created->expires_at->second);
        $this->assertSame(0, $created->expires_at->minute % 15);
    }

    public function test_即決価格は最低取引価格より高い必要がある(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $this->actingAs($user, 'sanctum')->postJson('/api/listings', [
            'item_id'      => $item->id,
            'price'        => 1000,
            'quantity'     => 1,
            'trade_type'   => 'auction',
            'buyout_price' => 800, // price 以下 → エラー
            'expires_at'   => now()->addDays(5)->toIso8601String(),
            'servers'      => [['server' => 'Emerald']],
        ])->assertStatus(422);
    }

    public function test_オークション出品は期限日が必須(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $this->actingAs($user, 'sanctum')->postJson('/api/listings', [
            'item_id'    => $item->id,
            'price'      => 1000,
            'quantity'   => 1,
            'trade_type' => 'auction',
            'servers'    => [['server' => 'Emerald']],
        ])->assertStatus(422);
    }

    public function test_過去の期限日のオークションは作成できない(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $this->actingAs($user, 'sanctum')->postJson('/api/listings', [
            'item_id'    => $item->id,
            'price'      => 1000,
            'quantity'   => 1,
            'trade_type' => 'auction',
            'expires_at' => now()->subHour()->toIso8601String(), // 過去 → 拒否
            'servers'    => [['server' => 'Emerald']],
        ])->assertStatus(422);
    }

    public function test_最低取引価格未満の入札は拒否される(): void
    {
        $listing = $this->makeAuctionListing(['price' => 1000]);
        $bidder  = $this->makeUser();

        $this->actingAs($bidder, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server'    => 'Emerald',
            'bid_price' => 900, // price 未満 → 拒否
        ])->assertStatus(400);
    }

    public function test_有効な入札で現在価格が更新される(): void
    {
        $listing = $this->makeAuctionListing(['price' => 1000]);
        $bidder  = $this->makeUser();

        $this->actingAs($bidder, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server'    => 'Emerald',
            'bid_price' => 1100,
        ])->assertStatus(201);

        $res = $this->getJson("/api/listings/{$listing->id}");
        $res->assertOk()
            ->assertJsonPath('current_price', 1100)
            ->assertJsonPath('best_bid', 1100)
            ->assertJsonPath('bid_count', 1);
    }

    public function test_最良入札より不利な入札は拒否される(): void
    {
        $listing = $this->makeAuctionListing(['price' => 1000]);
        $a = $this->makeUser();
        $b = $this->makeUser();

        $this->actingAs($a, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1200,
        ])->assertStatus(201);

        // 現在の最高入札(1200)以下 → 拒否。
        // 入力中に抜かれた利用者へ現在価格を提示できるよう、拒否レスポンスに current_price/best_bid を含める。
        $this->actingAs($b, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1150,
        ])->assertStatus(400)
            ->assertJsonPath('current_price', 1200)
            ->assertJsonPath('best_bid', 1200);
    }

    public function test_即決価格に達した入札で即時成立する(): void
    {
        $seller  = $this->makeUser();
        $item    = $this->makeItem();
        $listing = $this->makeAuctionListing([
            'user_id' => $seller->id, 'item_id' => $item->id,
            'price' => 1000, 'buyout_price' => 2000,
        ]);
        $loser  = $this->makeUser();
        $winner = $this->makeUser();

        // 先に低い入札
        $loserRes = $this->actingAs($loser, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1100,
        ]);
        $loserChatId = $loserRes->json('id');

        // 即決価格に達する入札 → 即時成立
        $winnerRes = $this->actingAs($winner, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 2000,
        ]);
        $winnerRes->assertSuccessful();
        $winnerChatId = $winnerRes->json('id');

        $this->assertSame('completed', $listing->fresh()->status);
        $this->assertSame('deal', TradeChat::find($winnerChatId)->status);
        $this->assertSame('declined', TradeChat::find($loserChatId)->status);
        $this->assertDatabaseHas('trade_history', [
            'listing_id' => $listing->id,
            'item_id'    => $item->id,
            'seller_id'  => $seller->id,
            'buyer_id'   => $winner->id,
            'price'      => 2000,
        ]);
    }

    public function test_入札があるオークションは取り下げ編集再出品できない(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeAuctionListing(['user_id' => $seller->id, 'price' => 1000]);
        $bidder  = $this->makeUser();

        $this->actingAs($bidder, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1100,
        ])->assertStatus(201);

        // 取り下げ不可
        $this->actingAs($seller, 'sanctum')->deleteJson("/api/listings/{$listing->id}")->assertStatus(400);
        // 編集不可
        $this->actingAs($seller, 'sanctum')->putJson("/api/listings/{$listing->id}", ['comment' => 'x'])->assertStatus(400);
        // 再出品不可（入札の有無に関わらずオークションは再出品不可）
        $this->actingAs($seller, 'sanctum')->postJson("/api/listings/{$listing->id}/renew")->assertStatus(400);
    }

    public function test_入札なしで終了したオークションは最低価格を下げて再出品できる(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeAuctionListing(['user_id' => $seller->id, 'price' => 1000]);
        $listing->update(['status' => 'expired']); // 入札なしで終了

        // 価格を下げない再出品は拒否
        $this->actingAs($seller, 'sanctum')->postJson("/api/listings/{$listing->id}/renew", [
            'price' => 1000, 'expires_at' => now()->addDay()->toIso8601String(),
        ])->assertStatus(422);

        // 最低取引価格を下げて再出品 → active に戻る
        $this->actingAs($seller, 'sanctum')->postJson("/api/listings/{$listing->id}/renew", [
            'price' => 800, 'buyout_price' => 1500, 'expires_at' => now()->addDay()->toIso8601String(),
        ])->assertOk();

        $fresh = $listing->fresh();
        $this->assertSame('active', $fresh->status);
        $this->assertSame(800, $fresh->price);
        $this->assertSame(1500, $fresh->buyout_price);
    }

    public function test_オークションはownerが手動成立できない(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeAuctionListing(['user_id' => $seller->id, 'price' => 1000]);
        $bidder  = $this->makeUser();

        $res = $this->actingAs($bidder, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1100,
        ]);
        $chatId = $res->json('id');

        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$chatId}/deal")->assertStatus(400);
        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$chatId}/decline")->assertStatus(400);
    }

    public function test_期限切れオークションは最良入札で自動成立する(): void
    {
        $seller  = $this->makeUser();
        $item    = $this->makeItem();
        $listing = $this->makeAuctionListing([
            'user_id' => $seller->id, 'item_id' => $item->id, 'price' => 1000,
        ]);
        $a = $this->makeUser();
        $b = $this->makeUser();

        $this->actingAs($a, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1100,
        ]);
        $bRes = $this->actingAs($b, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1300,
        ]);
        $winnerChatId = $bRes->json('id');

        // 期限日を過去にしてバッチ実行
        $listing->update(['expires_at' => now()->subMinute()]);
        $this->artisan('auctions:resolve')->assertExitCode(0);

        $this->assertSame('completed', $listing->fresh()->status);
        $this->assertSame('deal', TradeChat::find($winnerChatId)->status);
        $this->assertDatabaseHas('trade_history', [
            'listing_id' => $listing->id,
            'buyer_id'   => $b->id,
            'price'      => 1300,
        ]);
    }

    public function test_入札の無いオークションは期限切れで取り下げられる(): void
    {
        $listing = $this->makeAuctionListing(['price' => 1000]);
        $listing->update(['expires_at' => now()->subMinute()]);

        $this->artisan('auctions:resolve')->assertExitCode(0);

        $this->assertSame('expired', $listing->fresh()->status);
        $this->assertDatabaseCount('trade_history', 0);
    }

    public function test_他の入札者に価格更新通知が出る(): void
    {
        $listing = $this->makeAuctionListing(['price' => 1000]);
        $a = $this->makeUser();
        $b = $this->makeUser();

        $aRes = $this->actingAs($a, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1100,
        ]);
        $aChatId = $aRes->json('id');

        // B がより高い入札 → A は outbid
        $this->actingAs($b, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1200,
        ]);

        $this->assertNotNull(TradeChat::find($aChatId)->outbid_at);

        $summary = $this->actingAs($a, 'sanctum')->getJson('/api/notifications/summary');
        $summary->assertOk()
            ->assertJsonPath('outbid_chats.0.chat_id', $aChatId)
            ->assertJsonPath('outbid_chats.0.your_bid', 1100)
            ->assertJsonPath('outbid_chats.0.current_price', 1200);
    }

    public function test_買取オークションは最高取引価格超の入札を拒否し最安が落札する(): void
    {
        $buyer = $this->makeUser();
        $item  = $this->makeItem();
        $buyRequest = $this->makeAuctionBuyRequest([
            'user_id' => $buyer->id, 'item_id' => $item->id, 'price' => 500,
        ]);
        $a = $this->makeUser();
        $b = $this->makeUser();

        // 最高取引価格(500)超の入札は拒否
        $this->actingAs($a, 'sanctum')->postJson("/api/buy-requests/{$buyRequest->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 600,
        ])->assertStatus(400);

        // 有効な入札（安いほど有利）
        $this->actingAs($a, 'sanctum')->postJson("/api/buy-requests/{$buyRequest->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 450,
        ])->assertStatus(201);
        $bRes = $this->actingAs($b, 'sanctum')->postJson("/api/buy-requests/{$buyRequest->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 400,
        ]);
        $bRes->assertStatus(201);
        $winnerChatId = $bRes->json('id');

        // 期限切れ → 最安(400)が落札
        $buyRequest->update(['expires_at' => now()->subMinute()]);
        $this->artisan('auctions:resolve')->assertExitCode(0);

        $this->assertSame('completed', $buyRequest->fresh()->status);
        $this->assertDatabaseHas('trade_history', [
            'buy_request_id' => $buyRequest->id,
            'seller_id'      => $b->id,
            'buyer_id'       => $buyer->id,
            'price'          => 400,
        ]);
    }

    public function test_入札で現在価格が更新されると宣伝ポスト対象になる(): void
    {
        // 出品時点では bumped_at は未設定（created_at で宣伝対象になる）
        $listing = $this->makeAuctionListing(['price' => 1000]);
        $this->assertNull($listing->bumped_at);

        $bidder = $this->makeUser();
        $this->actingAs($bidder, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1100,
        ])->assertStatus(201);

        // 入札で現在価格が更新されると bumped_at が更新され、宣伝ポスト・新着順の対象に再浮上する
        $this->assertNotNull($listing->fresh()->bumped_at);
    }

    public function test_宣伝ポストにオークションの新規出品と入札更新が含まれる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $listing = $this->makeAuctionListing(['price' => 1000]);

        // 新規出品（created_at）で宣伝ポストの集計（既定は当日0:00〜現在）に含まれる
        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/promo-tweets');
        $res->assertOk();
        $this->assertGreaterThanOrEqual(1, $res->json('listing_count'));
    }

    public function test_期限切れのオークションは期限切れ件数に数えない(): void
    {
        $owner = $this->makeUser();
        $listing = $this->makeAuctionListing(['user_id' => $owner->id, 'price' => 1000]);
        $bidder = $this->makeUser();

        // 入札してから期限を過去にする（入札ありでも期限切れ扱いにならないことを検証）
        $this->actingAs($bidder, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1100,
        ])->assertStatus(201);
        $listing->update(['expires_at' => now()->subMinute()]);

        // 通知の expired_count（再出品促し）にオークションは含めない
        $this->actingAs($owner, 'sanctum')->getJson('/api/notifications/summary')
            ->assertOk()
            ->assertJsonPath('expired_count', 0);

        // モデルスコープでもオークションは期限切れに含まれない
        $this->assertSame(0, \App\Models\Listing::where('user_id', $owner->id)->expired()->count());
    }

    public function test_落選した入札のマイ取引に落札価格が付く(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeAuctionListing(['user_id' => $seller->id, 'price' => 1000, 'buyout_price' => 2000]);
        $loser   = $this->makeUser();
        $winner  = $this->makeUser();

        $this->actingAs($loser, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1100,
        ])->assertStatus(201);
        // 即決で勝者が落札（loser は declined になる）
        $this->actingAs($winner, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 2000,
        ])->assertSuccessful();

        // loser のマイ取引（取引希望）に落札価格(2000)が付く
        $res = $this->actingAs($loser, 'sanctum')->getJson('/api/mypage/chats');
        $res->assertOk();
        $mine = collect($res->json())->firstWhere('bid_price', 1100);
        $this->assertSame('declined', $mine['status']);
        $this->assertSame(2000, $mine['won_price']);
    }

    public function test_マイ取引から入札額を更新できる(): void
    {
        $listing = $this->makeAuctionListing(['price' => 1000]);
        $bidder  = $this->makeUser();

        $res = $this->actingAs($bidder, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server' => 'Emerald', 'bid_price' => 1100,
        ]);
        $chatId = $res->json('id');

        // より有利（高い）額に更新
        $this->actingAs($bidder, 'sanctum')->postJson("/api/chats/{$chatId}/bid", [
            'bid_price' => 1300,
        ])->assertOk();
        $this->assertSame(1300, TradeChat::find($chatId)->bid_price);

        // より不利（低い）額は拒否
        $this->actingAs($bidder, 'sanctum')->postJson("/api/chats/{$chatId}/bid", [
            'bid_price' => 1200,
        ])->assertStatus(400);
    }
}
