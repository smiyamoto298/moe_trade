<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Models\TradeChat;
use App\Support\WebPushSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

/**
 * 取引イベントで Web Push 送信（WebPushSender::send）が正しい宛先・内容で
 * 呼ばれることを検証する。実際のプッシュ送信はスパイで差し替える。
 */
class WebPushNotificationTest extends TestCase
{
    use RefreshDatabase;

    private MockInterface $push;

    protected function setUp(): void
    {
        parent::setUp();
        $this->push = $this->spy(WebPushSender::class);
    }

    /** オークション出品を作成する。 */
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

    public function test_新規取引希望で出品者に通知される(): void
    {
        $seller  = $this->makeUser();
        $buyer   = $this->makeUser();
        $listing = $this->makeListing($seller);

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(201);

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $seller->id && $title === 'MoE Trade — 新しい取引希望')
            ->once();
    }

    public function test_順番待ちの取引希望では通知されない(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeListing($seller);

        $this->actingAs($this->makeUser(), 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(201);
        // 2人目は順番待ち（owner から見えない）ため通知しない
        $this->actingAs($this->makeUser(), 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(201);

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $title === 'MoE Trade — 新しい取引希望')
            ->once();
    }

    public function test_買取への販売希望で買取登録者に通知される(): void
    {
        $owner  = $this->makeUser();
        $seller = $this->makeUser();
        $buyRequest = BuyRequest::create([
            'user_id'    => $owner->id,
            'item_id'    => $this->makeItem()->id,
            'price'      => 500,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'expires_at' => now()->addDays(7),
        ]);
        $buyRequest->servers()->create(['server' => 'Emerald']);

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/buy-requests/{$buyRequest->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(201);

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $owner->id && $title === 'MoE Trade — 新しい取引希望')
            ->once();
    }

    public function test_新着メッセージで相手側に通知される(): void
    {
        $seller  = $this->makeUser();
        $buyer   = $this->makeUser();
        $listing = $this->makeListing($seller);

        $chatId = $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->json('id');

        // 出品者が返信 → 買い手に通知
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chatId}/messages", ['message' => 'こんにちは'])
            ->assertStatus(201);

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title, $body) => $uid === $buyer->id
                && $title === 'MoE Trade — 新着メッセージ'
                && str_contains($body, 'こんにちは'))
            ->once();
    }

    public function test_取引希望直後の最初のメッセージは新着メッセージ通知を送らない(): void
    {
        $seller  = $this->makeUser();
        $buyer   = $this->makeUser();
        $listing = $this->makeListing($seller);

        // フロントの取引希望フロー：チャット作成 → 直後に最初のメッセージ送信
        $chatId = $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->json('id');
        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chatId}/messages", ['message' => "【取引希望】\nサーバー: Emerald\n希望時間帯: いつでも"])
            ->assertStatus(201);

        // 「新しい取引希望」1通のみ。「新着メッセージ」は送らない（二重通知の防止）
        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $seller->id && $title === 'MoE Trade — 新しい取引希望')
            ->once();
        $this->push->shouldNotHaveReceived('send', fn ($uid, $title) => $title === 'MoE Trade — 新着メッセージ');

        // 2通目以降のメッセージは通常どおり通知される
        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chatId}/messages", ['message' => '追加の質問です'])
            ->assertStatus(201);
        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title, $body) => $uid === $seller->id
                && $title === 'MoE Trade — 新着メッセージ'
                && str_contains($body, '追加の質問です'))
            ->once();
    }

    public function test_順番待ちチャットのメッセージは出品者に通知されない(): void
    {
        $seller  = $this->makeUser();
        $buyer2  = $this->makeUser();
        $listing = $this->makeListing($seller);

        $this->actingAs($this->makeUser(), 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald']);
        $chat2Id = $this->actingAs($buyer2, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->json('id');

        // 順番待ち（2番目）の買い手が追記しても owner へは通知しない
        $this->actingAs($buyer2, 'sanctum')
            ->postJson("/api/chats/{$chat2Id}/messages", ['message' => '追記です'])
            ->assertStatus(201);

        $this->push->shouldNotHaveReceived('send', fn ($uid, $title) => $title === 'MoE Trade — 新着メッセージ');
    }

    public function test_取引成立で取引希望者に通知される(): void
    {
        $seller  = $this->makeUser();
        $buyer   = $this->makeUser();
        $listing = $this->makeListing($seller);

        $chatId = $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->json('id');

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chatId}/deal")
            ->assertOk();

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $buyer->id && $title === 'MoE Trade — 取引成立')
            ->once();
    }

    public function test_出品者の見送りで取引希望者に通知される_本人の取り下げでは通知されない(): void
    {
        $seller  = $this->makeUser();
        $buyer1  = $this->makeUser();
        $buyer2  = $this->makeUser();
        $listing = $this->makeListing($seller);

        $chat1Id = $this->actingAs($buyer1, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->json('id');

        // owner が見送り → buyer1 に通知
        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$chat1Id}/decline")->assertOk();

        // buyer2 が取引希望を出して自分で取り下げ → 通知なし
        $chat2Id = $this->actingAs($buyer2, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->json('id');
        $this->actingAs($buyer2, 'sanctum')->postJson("/api/chats/{$chat2Id}/decline")->assertOk();

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $buyer1->id && $title === 'MoE Trade — 取引見送り')
            ->once();
        $this->push->shouldNotHaveReceived('send', fn ($uid, $title) => $uid === $buyer2->id && $title === 'MoE Trade — 取引見送り');
    }

    public function test_入札で出品者に通知され_抜かれた入札者に価格更新が通知される(): void
    {
        $owner   = $this->makeUser();
        $bidder1 = $this->makeUser();
        $bidder2 = $this->makeUser();
        $listing = $this->makeAuctionListing(['user_id' => $owner->id]);

        $this->actingAs($bidder1, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald', 'bid_price' => 1000])
            ->assertStatus(201);
        $this->actingAs($bidder2, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald', 'bid_price' => 1500])
            ->assertStatus(201);

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $owner->id && $title === 'MoE Trade — 入札がありました')
            ->twice();
        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title, $body) => $uid === $bidder1->id
                && $title === 'MoE Trade — 価格更新'
                && str_contains($body, '1500'))
            ->once();
    }

    public function test_即決落札では操作した本人に通知されない(): void
    {
        $owner   = $this->makeUser();
        $bidder  = $this->makeUser();
        $listing = $this->makeAuctionListing(['user_id' => $owner->id, 'buyout_price' => 2000]);

        $this->actingAs($bidder, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald', 'bid_price' => 2000])
            ->assertStatus(201);

        // owner には成立通知、即決した本人には落札通知を送らない
        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $owner->id && $title === 'MoE Trade — オークション成立')
            ->once();
        $this->push->shouldNotHaveReceived('send', fn ($uid, $title) => $uid === $bidder->id && $title === 'MoE Trade — 落札しました');
    }

    public function test_バッチ解決で落札者_出品者_落選者に通知される(): void
    {
        $owner   = $this->makeUser();
        $winner  = $this->makeUser();
        $loser   = $this->makeUser();
        $listing = $this->makeAuctionListing(['user_id' => $owner->id, 'expires_at' => now()->subMinutes(30)]);

        TradeChat::create(['listing_id' => $listing->id, 'buyer_id' => $winner->id, 'server' => 'Emerald', 'bid_price' => 1500]);
        TradeChat::create(['listing_id' => $listing->id, 'buyer_id' => $loser->id,  'server' => 'Emerald', 'bid_price' => 1200]);

        $this->artisan('auctions:resolve')->assertSuccessful();

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $winner->id && $title === 'MoE Trade — 落札しました')
            ->once();
        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $owner->id && $title === 'MoE Trade — オークション成立')
            ->once();
        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $loser->id && $title === 'MoE Trade — 落札ならず')
            ->once();
    }

    public function test_入札なしで終了したオークションは出品者に通知される(): void
    {
        $owner   = $this->makeUser();
        $this->makeAuctionListing(['user_id' => $owner->id, 'expires_at' => now()->subMinutes(30)]);

        $this->artisan('auctions:resolve')->assertSuccessful();

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $title) => $uid === $owner->id && $title === 'MoE Trade — オークション終了')
            ->once();
    }
}
