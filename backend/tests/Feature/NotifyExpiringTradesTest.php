<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Support\NotificationCategory;
use App\Support\Notifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

/**
 * 期限切れ前日（24時間以内）の通知バッチ（trades:notify-expiring）。
 */
class NotifyExpiringTradesTest extends TestCase
{
    use RefreshDatabase;

    private MockInterface $push;

    protected function setUp(): void
    {
        parent::setUp();
        $this->push = $this->spy(Notifier::class);
    }

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

    public function test_期限まで24時間以内の出品は登録者に通知され送信済みになる(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeListing($seller, null, ['expires_at' => now()->addHours(12)]);

        $this->artisan('trades:notify-expiring')->assertSuccessful();

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $cat, $title, $body) => $uid === $seller->id
                && $cat === NotificationCategory::EXPIRY
                && $title === 'MoE Trade — まもなく期限切れ'
                && str_contains($body, 'テストの剣'))
            ->once();
        $this->assertNotNull($listing->fresh()->expiry_notified_at);
    }

    public function test_同じ期限に対して二重送信しない(): void
    {
        $this->makeListing(null, null, ['expires_at' => now()->addHours(12)]);

        $this->artisan('trades:notify-expiring')->assertSuccessful();
        $this->artisan('trades:notify-expiring')->assertSuccessful();

        $this->push->shouldHaveReceived('send')->times(1);
    }

    public function test_期限まで24時間より先の出品は対象外(): void
    {
        $this->makeListing(null, null, ['expires_at' => now()->addHours(30)]);

        $this->artisan('trades:notify-expiring')->assertSuccessful();

        $this->push->shouldNotHaveReceived('send');
    }

    public function test_期限超過済み_非active_オークションは対象外(): void
    {
        // 期限超過（listings:expire の担当）
        $this->makeListing(null, null, ['expires_at' => now()->subHour()]);
        // すでに expired
        $this->makeListing(null, null, ['expires_at' => now()->addHours(12), 'status' => 'expired']);
        // オークション（自動成立/取り下げ・延長不可のため通知しない）
        $this->makeListing(null, null, ['expires_at' => now()->addHours(12), 'trade_type' => 'auction']);

        $this->artisan('trades:notify-expiring')->assertSuccessful();

        $this->push->shouldNotHaveReceived('send');
    }

    public function test_買取も期限まで24時間以内なら通知される(): void
    {
        $owner = $this->makeUser();
        $this->makeBuyRequest(['user_id' => $owner->id, 'expires_at' => now()->addHours(6)]);

        $this->artisan('trades:notify-expiring')->assertSuccessful();

        $this->push->shouldHaveReceived('send')
            ->withArgs(fn ($uid, $cat, $title, $body) => $uid === $owner->id && str_contains($body, '買取'))
            ->once();
    }

    public function test_期限を延長すると送信済みがリセットされ新しい期限で再通知される(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeListing($seller, null, ['expires_at' => now()->addHours(12)]);

        $this->artisan('trades:notify-expiring')->assertSuccessful();
        $this->assertNotNull($listing->fresh()->expiry_notified_at);

        // 期限更新（renew）で expires_at が変わる → フラグがリセットされる
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/renew")
            ->assertOk();
        $this->assertNull($listing->fresh()->expiry_notified_at);

        // 新しい期限（7日後）はまだ24時間圏外 → 送信されない
        $this->artisan('trades:notify-expiring')->assertSuccessful();
        $this->push->shouldHaveReceived('send')->times(1);

        // 新しい期限の前日になったら再通知される
        $this->travel(6)->days();
        $this->artisan('trades:notify-expiring')->assertSuccessful();
        $this->push->shouldHaveReceived('send')->times(2);
    }
}
