<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Models\Item;
use App\Models\Listing;
use App\Models\TradeHistory;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAnalyticsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // JSTの日付境界テストを決定的にするため現在時刻を固定（JST 2026-08-06 12:00 = UTC 03:00）
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-06 03:00:00', 'UTC'));
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /**
     * created_at を指定日時（UTC）に差し替えた出品を作成する。
     */
    private function makeListingAt(string $utc): Listing
    {
        $listing = $this->makeListing();
        $listing->created_at = $utc;
        $listing->save();

        return $listing;
    }

    /**
     * created_at を指定日時（UTC）に差し替えた買取募集を作成する。
     */
    private function makeBuyRequestAt(string $utc, ?User $user = null, ?Item $item = null): BuyRequest
    {
        $buyRequest = BuyRequest::create([
            'user_id'    => ($user ?? $this->makeUser())->id,
            'item_id'    => ($item ?? $this->makeItem())->id,
            'price'      => 800,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'expires_at' => now()->addMonth(),
        ]);
        $buyRequest->created_at = $utc;
        $buyRequest->save();

        return $buyRequest;
    }

    /**
     * 指定日時（UTC）に成立した出品由来の取引履歴を作成する。
     */
    private function makeTradeAt(string $utc, bool $isValid = true, ?User $seller = null, ?User $buyer = null): TradeHistory
    {
        // 裏付けの出品は集計期間外に置き、出品数のカウントを汚さない
        $listing = $this->makeListingAt('2026-07-01 00:00:00');

        return TradeHistory::create([
            'listing_id' => $listing->id,
            'item_id'    => $listing->item_id,
            'seller_id'  => ($seller ?? $listing->user)->id,
            'buyer_id'   => $buyer?->id,
            'price'      => 1000,
            'currency'   => 'AC',
            'server'     => 'Emerald',
            'is_valid'   => $isValid,
            'traded_at'  => $utc,
        ]);
    }

    /**
     * 指定日時（UTC）に成立した買取由来の取引履歴を作成する。
     */
    private function makeBuyRequestTradeAt(string $utc, ?User $seller = null, ?User $buyer = null): TradeHistory
    {
        // 裏付けの買取募集は集計期間外に置き、買取数のカウントを汚さない
        $buyRequest = $this->makeBuyRequestAt('2026-07-01 00:00:00', $buyer);

        return TradeHistory::create([
            'buy_request_id' => $buyRequest->id,
            'item_id'        => $buyRequest->item_id,
            'seller_id'      => ($seller ?? $this->makeUser())->id,
            'buyer_id'       => $buyRequest->user_id,
            'price'          => 1000,
            'currency'       => 'AC',
            'server'         => 'Emerald',
            'is_valid'       => true,
            'traded_at'      => $utc,
        ]);
    }

    public function test_未認証は利用状況解析にアクセスできない(): void
    {
        $this->getJson('/api/admin/analytics/usage')->assertStatus(401);
    }

    public function test_一般ユーザーとeditorは利用状況解析にアクセスできない(): void
    {
        $this->actingAs($this->makeUser(), 'sanctum')
            ->getJson('/api/admin/analytics/usage')->assertStatus(403);
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->getJson('/api/admin/analytics/usage')->assertStatus(403);
    }

    public function test_adminは日次の出品数買取数取引成立数を取得できる(): void
    {
        $admin = $this->makeUserWithRole('admin');

        // JST 8/5 に出品2件（UTC 8/4 15:00 以降が JST 8/5）、JST 8/6 に1件
        $this->makeListingAt('2026-08-04 20:00:00');
        $this->makeListingAt('2026-08-05 05:00:00');
        $this->makeListingAt('2026-08-06 01:00:00');
        // JST 8/6 に買取1件
        $this->makeBuyRequestAt('2026-08-05 23:00:00');
        // JST 8/5 に成立1件
        $this->makeTradeAt('2026-08-05 09:00:00');

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $res->assertOk()
            ->assertJsonPath('days', 7)
            ->assertJsonPath('from', '2026-07-31')
            ->assertJsonPath('to', '2026-08-06')
            ->assertJsonPath('totals.listings', 3)
            ->assertJsonPath('totals.buy_requests', 1)
            ->assertJsonPath('totals.registrations', 4)
            ->assertJsonPath('totals.trades', 1)
            ->assertJsonPath('totals.listing_trades', 1)
            ->assertJsonPath('totals.buy_request_trades', 0)
            ->assertJsonCount(7, 'daily');

        $daily = collect($res->json('daily'))->keyBy('date');
        $this->assertSame(2, $daily['2026-08-05']['listings']);
        $this->assertSame(1, $daily['2026-08-06']['listings']);
        $this->assertSame(1, $daily['2026-08-06']['buy_requests']);
        // 登録は出品＋買取の合算（8/5=出品2、8/6=出品1＋買取1）
        $this->assertSame(2, $daily['2026-08-05']['registrations']);
        $this->assertSame(2, $daily['2026-08-06']['registrations']);
        $this->assertSame(1, $daily['2026-08-05']['trades']);
        // 該当のない日はゼロ埋めされる
        $this->assertSame(0, $daily['2026-07-31']['listings']);
        $this->assertSame(0, $daily['2026-07-31']['registrations']);
    }

    public function test_JSTの日付境界で集計される(): void
    {
        $admin = $this->makeUserWithRole('admin');

        // UTC 8/5 14:59 = JST 8/5 23:59、UTC 8/5 15:00 = JST 8/6 00:00
        $this->makeListingAt('2026-08-05 14:59:00');
        $this->makeListingAt('2026-08-05 15:00:00');

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $daily = collect($res->json('daily'))->keyBy('date');
        $this->assertSame(1, $daily['2026-08-05']['listings']);
        $this->assertSame(1, $daily['2026-08-06']['listings']);
    }

    public function test_期間外のレコードは含まれない(): void
    {
        $admin = $this->makeUserWithRole('admin');

        // JST 7/30（= days=7 の期間 7/31〜8/6 の前日）
        $this->makeListingAt('2026-07-30 05:00:00');

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $res->assertOk()->assertJsonPath('totals.listings', 0);
    }

    public function test_相場対象外の取引は成立数に含まれない(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $this->makeTradeAt('2026-08-05 09:00:00', isValid: true);
        $this->makeTradeAt('2026-08-05 10:00:00', isValid: false);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $res->assertOk()->assertJsonPath('totals.trades', 1);
    }

    public function test_成立は出品由来と買取由来に分かれて集計される(): void
    {
        $admin = $this->makeUserWithRole('admin');

        // JST 8/5 に出品由来1件と買取由来1件、JST 8/6 に買取由来1件（UTC 8/5 16:00 = JST 8/6 01:00）
        $this->makeTradeAt('2026-08-05 09:00:00');
        $this->makeBuyRequestTradeAt('2026-08-05 05:00:00');
        $this->makeBuyRequestTradeAt('2026-08-05 16:00:00');

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $res->assertOk()
            ->assertJsonPath('totals.listing_trades', 1)
            ->assertJsonPath('totals.buy_request_trades', 2)
            ->assertJsonPath('totals.trades', 3);

        $daily = collect($res->json('daily'))->keyBy('date');
        $this->assertSame(1, $daily['2026-08-05']['listing_trades']);
        $this->assertSame(1, $daily['2026-08-05']['buy_request_trades']);
        $this->assertSame(1, $daily['2026-08-06']['buy_request_trades']);
        $this->assertSame(2, $daily['2026-08-05']['trades']);
    }

    public function test_取引にかかわったユニークユーザー数を返す(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $alice = $this->makeUser();
        $bob   = $this->makeUser();
        $carol = $this->makeUser();

        // alice→bob の出品由来、carol→bob の買取由来。bob は両方に登場するが1人として数える
        $this->makeTradeAt('2026-08-05 09:00:00', seller: $alice, buyer: $bob);
        $this->makeBuyRequestTradeAt('2026-08-06 01:00:00', seller: $carol, buyer: $bob);
        // 相場対象外（is_valid=false）の取引の参加者は数えない
        $this->makeTradeAt('2026-08-05 10:00:00', isValid: false, seller: $this->makeUser(), buyer: $this->makeUser());
        // 期間外の取引の参加者も数えない
        $this->makeTradeAt('2026-07-01 09:00:00', seller: $this->makeUser());

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $res->assertOk()->assertJsonPath('totals.trade_users', 3);
    }

    public function test_buyer_idが無い旧データでもユニークユーザー数を集計できる(): void
    {
        $admin = $this->makeUserWithRole('admin');

        // buyer_id = null（旧データ）は売り手だけ数える
        $this->makeTradeAt('2026-08-05 09:00:00');

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $res->assertOk()->assertJsonPath('totals.trade_users', 1);
    }

    public function test_daysの指定が不正なら422(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/analytics/usage?days=0')->assertStatus(422);
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/analytics/usage?days=366')->assertStatus(422);
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/analytics/usage?days=abc')->assertStatus(422);
    }

    public function test_days未指定は30日分を返す(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage');

        $res->assertOk()->assertJsonPath('days', 30)->assertJsonCount(30, 'daily');
    }
}
