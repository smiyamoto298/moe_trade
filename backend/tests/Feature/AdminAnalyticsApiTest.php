<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Models\Item;
use App\Models\Listing;
use App\Models\TradeHistory;
use App\Models\User;
use App\Models\UserDailyAccess;
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

    public function test_一般ユーザーは利用状況解析にアクセスできない(): void
    {
        $this->actingAs($this->makeUser(), 'sanctum')
            ->getJson('/api/admin/analytics/usage')->assertStatus(403);
    }

    public function test_editorは利用状況解析にアクセスできる(): void
    {
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->getJson('/api/admin/analytics/usage')->assertOk();
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

    public function test_日ごとのユニークアクセスユーザー数を返す(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $alice = $this->makeUser();
        $bob   = $this->makeUser();
        $carol = $this->makeUser();

        // JST 8/5 に alice・bob、8/6 に alice（リピート）。carol は期間外（7/30）
        UserDailyAccess::create(['user_id' => $alice->id, 'date' => '2026-08-05', 'hour' => 10]);
        // 同じ日の別の時間帯にもう1行できても、日次では同一ユーザーとして1人に数える
        UserDailyAccess::create(['user_id' => $alice->id, 'date' => '2026-08-05', 'hour' => 22]);
        UserDailyAccess::create(['user_id' => $bob->id,   'date' => '2026-08-05', 'hour' => 10]);
        UserDailyAccess::create(['user_id' => $alice->id, 'date' => '2026-08-06', 'hour' => 9]);
        UserDailyAccess::create(['user_id' => $carol->id, 'date' => '2026-07-30', 'hour' => 9]);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $daily = collect($res->json('daily'))->keyBy('date');
        $this->assertSame(2, $daily['2026-08-05']['active_users']);
        // 8/6 は alice ＋ このリクエスト自身で記録された admin の2人
        $this->assertSame(2, $daily['2026-08-06']['active_users']);
        // 該当のない日はゼロ埋めされる
        $this->assertSame(0, $daily['2026-07-31']['active_users']);
        // 期間合計は日次の合算ではなく期間内ユニーク（alice・bob・admin。期間外の carol は含まない）
        $res->assertJsonPath('totals.active_users', 3);
    }

    public function test_認証済みリクエストでアクセスがJST日付で記録される(): void
    {
        $user = $this->makeUser();

        // UTC 8/5 20:00 = JST 8/6 05:00 → JST の 8/6・5時として記録される
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-05 20:00:00', 'UTC'));

        $this->actingAs($user, 'sanctum')->getJson('/api/items')->assertOk();

        $this->assertDatabaseHas('user_daily_accesses', [
            'user_id' => $user->id,
            'date'    => '2026-08-06',
            'hour'    => 5,
        ]);
    }

    public function test_同じ時間帯の複数リクエストでもアクセス記録は1件のまま(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user, 'sanctum')->getJson('/api/items')->assertOk();
        $this->actingAs($user, 'sanctum')->getJson('/api/items')->assertOk();

        $this->assertSame(1, UserDailyAccess::where('user_id', $user->id)->count());
    }

    public function test_同日でも時間帯が違えばアクセス記録は別行になる(): void
    {
        $user = $this->makeUser();

        // JST 8/6 10時
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-06 01:00:00', 'UTC'));
        $this->actingAs($user, 'sanctum')->getJson('/api/items')->assertOk();
        // 同じ 10 時台なので増えない
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-06 01:59:00', 'UTC'));
        $this->actingAs($user, 'sanctum')->getJson('/api/items')->assertOk();
        // JST 8/6 11時 → 別の時間帯なので1行増える
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-06 02:00:00', 'UTC'));
        $this->actingAs($user, 'sanctum')->getJson('/api/items')->assertOk();

        $this->assertSame([10, 11], UserDailyAccess::where('user_id', $user->id)
            ->orderBy('hour')->pluck('hour')->all());
    }

    public function test_未認証リクエストはアクセス記録されない(): void
    {
        $this->getJson('/api/items')->assertOk();

        $this->assertSame(0, UserDailyAccess::count());
    }

    public function test_時間帯分布は日付が違っても同じ時刻を合算する(): void
    {
        $admin = $this->makeUserWithRole('admin');

        // UTC 01:00 = JST 10時。8/4・8/5 と別の日だが同じ 10 時台にまとまる
        $this->makeListingAt('2026-08-04 01:00:00');
        $this->makeListingAt('2026-08-05 01:00:00');
        // UTC 01:59 も JST 10時台（分は切り捨てて時だけで束ねる）
        $this->makeListingAt('2026-08-05 01:59:00');
        // UTC 02:00 = JST 11時
        $this->makeListingAt('2026-08-05 02:00:00');
        // JST 10時の買取1件・成立1件（登録・成立の合算も時間帯で計算される）
        $this->makeBuyRequestAt('2026-08-05 01:30:00');
        $this->makeTradeAt('2026-08-05 01:30:00');
        $this->makeBuyRequestTradeAt('2026-08-05 01:30:00');

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $res->assertOk()->assertJsonCount(24, 'hourly');

        $hourly = collect($res->json('hourly'))->keyBy('hour');
        $this->assertSame(3, $hourly[10]['listings']);
        $this->assertSame(1, $hourly[10]['buy_requests']);
        $this->assertSame(4, $hourly[10]['registrations']);
        $this->assertSame(1, $hourly[10]['listing_trades']);
        $this->assertSame(1, $hourly[10]['buy_request_trades']);
        $this->assertSame(2, $hourly[10]['trades']);
        $this->assertSame(1, $hourly[11]['listings']);
        // 該当のない時間はゼロ埋めされる（0〜23時すべてを返す）
        $this->assertSame(0, $hourly[0]['listings']);
        $this->assertSame(0, $hourly[23]['registrations']);
        $this->assertSame(range(0, 23), collect($res->json('hourly'))->pluck('hour')->all());
    }

    public function test_時間帯分布はJSTの時刻で集計され期間外は含まれない(): void
    {
        $admin = $this->makeUserWithRole('admin');

        // UTC 15:00 = JST 翌日 0時（日付だけでなく時もJSTに変換される）
        $this->makeListingAt('2026-08-05 15:00:00');
        // UTC 14:59 = JST 23時
        $this->makeListingAt('2026-08-05 14:59:00');
        // 期間外（UTC 7/29 15:00 = JST 7/30 0時。期間 7/31〜8/6 の前日）は時間帯分布にも含まれない
        $this->makeListingAt('2026-07-29 15:00:00');

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $hourly = collect($res->json('hourly'))->keyBy('hour');
        $this->assertSame(1, $hourly[0]['listings']);
        $this->assertSame(1, $hourly[23]['listings']);
        $this->assertSame(2, collect($res->json('hourly'))->sum('listings'));
    }

    public function test_時間帯分布の合計は期間合計と一致する(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $this->makeListingAt('2026-08-04 20:00:00');
        $this->makeListingAt('2026-08-05 05:00:00');
        $this->makeBuyRequestAt('2026-08-05 23:00:00');
        $this->makeTradeAt('2026-08-05 09:00:00');
        $this->makeBuyRequestTradeAt('2026-08-05 16:00:00');
        // 相場対象外は日別と同様に時間帯分布からも除外される
        $this->makeTradeAt('2026-08-05 10:00:00', isValid: false);

        $res     = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');
        $hourly  = collect($res->json('hourly'));

        // active_users は「日ごと・時間帯ごとのユニークユーザー」の延べ数なので、
        // 期間ユニークの totals.active_users とは一致しない（下のテストで検証する）
        foreach (['listings', 'buy_requests', 'registrations', 'listing_trades', 'buy_request_trades', 'trades'] as $key) {
            $this->assertSame($res->json("totals.$key"), $hourly->sum($key), "時間帯分布の $key 合計が期間合計と一致しない");
        }
    }

    public function test_時間帯分布のアクセスは時間帯ごとのユニークユーザーの延べ数を返す(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $alice = $this->makeUser();
        $bob   = $this->makeUser();

        // 日付が違っても同じ 10 時台なら合算される（alice の 8/4・8/5 で 2）
        UserDailyAccess::create(['user_id' => $alice->id, 'date' => '2026-08-04', 'hour' => 10]);
        UserDailyAccess::create(['user_id' => $alice->id, 'date' => '2026-08-05', 'hour' => 10]);
        UserDailyAccess::create(['user_id' => $bob->id,   'date' => '2026-08-05', 'hour' => 10]);
        // 同じユーザーの別の時間帯は別の時間にカウントされる
        UserDailyAccess::create(['user_id' => $alice->id, 'date' => '2026-08-05', 'hour' => 23]);
        // 時間帯の記録開始前の古い行（hour が null）は時刻が不明なため含まない
        UserDailyAccess::create(['user_id' => $bob->id, 'date' => '2026-08-05', 'hour' => null]);
        // 期間外（7/30）は含まない
        UserDailyAccess::create(['user_id' => $bob->id, 'date' => '2026-07-30', 'hour' => 10]);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/analytics/usage?days=7');

        $hourly = collect($res->json('hourly'))->keyBy('hour');
        $this->assertSame(3, $hourly[10]['active_users']);
        $this->assertSame(1, $hourly[23]['active_users']);
        // このリクエスト自身が JST 8/6 12時のアクセスとして記録される
        $this->assertSame(1, $hourly[12]['active_users']);
        // 該当のない時間はゼロ埋めされる
        $this->assertSame(0, $hourly[0]['active_users']);
        // 延べ数のため、期間ユニークの合計（alice・bob・admin の3人）とは一致しない
        $res->assertJsonPath('totals.active_users', 3);
        $this->assertSame(5, collect($res->json('hourly'))->sum('active_users'));
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
