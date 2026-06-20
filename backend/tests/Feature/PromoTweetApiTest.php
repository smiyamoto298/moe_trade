<?php

namespace Tests\Feature;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Models\TradeHistory;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PromoTweetApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // JSTの日付境界を確実にまたがない時刻（= 6/12 12:00 JST）に固定する
        $this->travelTo(Carbon::parse('2026-06-12 03:00:00', 'UTC'));
    }

    public function test_未ログインはアクセスできない(): void
    {
        $this->getJson('/api/admin/promo-tweets')->assertStatus(401);
    }

    public function test_一般ユーザーとeditorはアクセスできない(): void
    {
        $this->actingAs($this->makeUser(), 'sanctum')
            ->getJson('/api/admin/promo-tweets')->assertStatus(403);
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->getJson('/api/admin/promo-tweets')->assertStatus(403);
    }

    public function test_adminは当日の出品_買取_取引件数の文面を取得できる(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $seller = $this->makeUser();
        $buyer  = $this->makeUser();

        // 当日の出品
        $sword   = $this->makeItem(['name' => '剛力の剣']);
        $listing = $this->makeListing($seller, $sword, ['price' => 12000]);

        // 2日前の出品（対象外）
        $oldItem = $this->makeItem(['name' => '過去の槍', 'category_id' => $sword->category_id]);
        $old     = $this->makeListing($seller, $oldItem);
        Listing::where('id', $old->id)->update(['created_at' => now()->subDays(2)]);

        // 当日だが取り下げ済みの出品（対象外）
        $cancelledItem = $this->makeItem(['name' => '取り下げの斧', 'category_id' => $sword->category_id]);
        $this->makeListing($seller, $cancelledItem, ['status' => 'cancelled']);

        // 当日の買取
        $shield = $this->makeItem(['name' => '守りの盾', 'category_id' => $sword->category_id]);
        BuyRequest::create([
            'user_id'    => $buyer->id,
            'item_id'    => $shield->id,
            'price'      => 500,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'expires_at' => now()->addMonth(),
        ]);

        // 取引履歴: 当日の有効2件＋当日の無効1件＋2日前の有効1件 → カウントは2
        foreach ([now(), now()] as $tradedAt) {
            TradeHistory::create([
                'listing_id' => $listing->id, 'item_id' => $sword->id, 'seller_id' => $seller->id,
                'price' => 12000, 'server' => 'Emerald', 'is_valid' => true, 'traded_at' => $tradedAt,
            ]);
        }
        TradeHistory::create([
            'listing_id' => $listing->id, 'item_id' => $sword->id, 'seller_id' => $seller->id,
            'price' => 12000, 'server' => 'Emerald', 'is_valid' => false, 'traded_at' => now(),
        ]);
        TradeHistory::create([
            'listing_id' => $listing->id, 'item_id' => $sword->id, 'seller_id' => $seller->id,
            'price' => 12000, 'server' => 'Emerald', 'is_valid' => true, 'traded_at' => now()->subDays(2),
        ]);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/promo-tweets');

        // 前回ツイート時刻が未記録なら当日0:00〜現在を集計する
        $res->assertOk()
            ->assertJsonPath('mode', 'day')
            ->assertJsonPath('since', '2026-06-12T00:00')
            ->assertJsonPath('until', '2026-06-12T12:00')
            ->assertJsonPath('last_posted_at', null)
            ->assertJsonPath('trade_count', 2)
            ->assertJsonPath('listing_count', 1)
            ->assertJsonPath('buy_request_count', 1);

        $all = implode("\n", array_column($res->json('tweets'), 'text'));
        $this->assertStringContainsString('【本日の取引成立】2件', $all);
        // 現在有効な出品（剛力の剣＋過去の槍。取り下げの斧は cancelled で除外）と買取（守りの盾）の登録総数
        $this->assertStringContainsString('【現在の登録数】出品2件:買取1件', $all);
        $this->assertStringContainsString('【新規の取引】', $all);
        $this->assertStringContainsString('売)剛力の剣 12,000AC', $all);
        $this->assertStringContainsString('買)守りの盾 500AC', $all);
        $this->assertStringNotContainsString('過去の槍', $all);
        $this->assertStringNotContainsString('取り下げの斧', $all);
    }

    public function test_同一アイテム同一価格の出品は個数に集約される(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $seller = $this->makeUser();
        $arrow  = $this->makeItem(['name' => '量産の矢']);

        // 一括出品由来を想定（個数1の出品×3）
        foreach (range(1, 3) as $_) {
            $this->makeListing($seller, $arrow, ['price' => 100]);
        }

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/promo-tweets');

        $res->assertOk()->assertJsonPath('listing_count', 3);
        $all = implode("\n", array_column($res->json('tweets'), 'text'));
        $this->assertStringContainsString('売)量産の矢 100AC ×3', $all);
    }

    public function test_since指定で集計開始時刻を絞り込める(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $seller = $this->makeUser();

        // 5時間前の出品（since より前なので対象外）
        $oldItem = $this->makeItem(['name' => '5時間前の剣']);
        $old     = $this->makeListing($seller, $oldItem, ['price' => 3000]);
        Listing::where('id', $old->id)->update(['created_at' => now()->subHours(5)]);

        // 直近の出品（since 以降なので対象）
        $recent = $this->makeItem(['name' => '直近の盾', 'category_id' => $oldItem->category_id]);
        $this->makeListing($seller, $recent, ['price' => 800]);

        // 前回ツイート時刻を2時間前に指定する（JST）
        $since = \Carbon\CarbonImmutable::now('Asia/Tokyo')->subHours(2)->format('Y-m-d\TH:i');
        $res   = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/promo-tweets?since=' . $since);

        $res->assertOk()
            ->assertJsonPath('mode', 'day')
            ->assertJsonPath('since', $since)
            ->assertJsonPath('listing_count', 1);
        $all = implode("\n", array_column($res->json('tweets'), 'text'));
        $this->assertStringContainsString('売)直近の盾 800AC', $all);
        $this->assertStringNotContainsString('5時間前の剣', $all);
    }

    public function test_値下げ再出品で新着扱いになった出品は作成日が古くても宣伝対象に入る(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $seller = $this->makeUser();

        // 5時間前に作成された期限切れ出品（since=2時間前 では本来対象外）
        $item = $this->makeItem(['name' => '値下げの剣']);
        $old  = $this->makeListing($seller, $item, ['price' => 3000, 'status' => 'expired', 'expires_at' => now()->subDay()]);
        Listing::where('id', $old->id)->update(['created_at' => now()->subHours(5)]);

        // 値下げ再出品 → bumped_at が現在時刻になり「新着扱い」
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/listings/{$old->id}/renew", ['price' => 1500])
            ->assertOk();

        // since=2時間前。作成日(5時間前)は範囲外だが bumped_at(現在)で対象に含まれる
        $since = \Carbon\CarbonImmutable::now('Asia/Tokyo')->subHours(2)->format('Y-m-d\TH:i');
        $res   = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/promo-tweets?since=' . $since);

        $res->assertOk()->assertJsonPath('listing_count', 1);
        $all = implode("\n", array_column($res->json('tweets'), 'text'));
        $this->assertStringContainsString('売)値下げの剣 1,500AC', $all);
    }

    public function test_不正なsince形式は422(): void
    {
        $this->actingAs($this->makeUserWithRole('admin'), 'sanctum')
            ->getJson('/api/admin/promo-tweets?since=not-a-date')
            ->assertStatus(422);
    }

    public function test_xでポスト押下で前回ツイート時刻が記録され次回集計の起点になる(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $seller = $this->makeUser();

        // 記録前の出品（記録時刻より前なので次回は対象外になる）
        $before = $this->makeItem(['name' => '記録前の剣']);
        $this->makeListing($seller, $before, ['price' => 100]);

        // 12:30 JST に「Xでポスト」＝前回ツイート時刻を記録
        $this->travelTo(Carbon::parse('2026-06-12 03:30:00', 'UTC'));
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/promo-tweets/posted')
            ->assertOk()
            ->assertJsonPath('last_posted_at', '2026-06-12T12:30');

        // 13:00 JST に新たな出品
        $this->travelTo(Carbon::parse('2026-06-12 04:00:00', 'UTC'));
        $after = $this->makeItem(['name' => '記録後の盾', 'category_id' => $before->category_id]);
        $this->makeListing($seller, $after, ['price' => 800]);

        // since 省略時は記録済みの前回ツイート時刻（12:30）が起点になる
        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/promo-tweets');

        $res->assertOk()
            ->assertJsonPath('since', '2026-06-12T12:30')
            ->assertJsonPath('last_posted_at', '2026-06-12T12:30')
            ->assertJsonPath('listing_count', 1);
        $all = implode("\n", array_column($res->json('tweets'), 'text'));
        $this->assertStringContainsString('売)記録後の盾 800AC', $all);
        $this->assertStringNotContainsString('記録前の剣', $all);
    }

    public function test_postedは管理者以外拒否される(): void
    {
        $this->postJson('/api/admin/promo-tweets/posted')->assertStatus(401);
        $this->actingAs($this->makeUser(), 'sanctum')
            ->postJson('/api/admin/promo-tweets/posted')->assertStatus(403);
    }

    public function test_期間指定で複数日の累計を取得できる(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $seller = $this->makeUser();

        // 2日前の出品（単日モードでは対象外だが、期間に含まれれば集計される）
        $sword = $this->makeItem(['name' => '過去の剣']);
        $old   = $this->makeListing($seller, $sword, ['price' => 3000]);
        Listing::where('id', $old->id)->update(['created_at' => now()->subDays(2)]);

        // 当日の出品
        $shield = $this->makeItem(['name' => '本日の盾', 'category_id' => $sword->category_id]);
        $today  = $this->makeListing($seller, $shield, ['price' => 800]);

        // 期間内の取引履歴（2日前）
        TradeHistory::create([
            'listing_id' => $today->id, 'item_id' => $shield->id, 'seller_id' => $seller->id,
            'price' => 800, 'server' => 'Emerald', 'is_valid' => true, 'traded_at' => now()->subDays(2),
        ]);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/promo-tweets?from=2026-06-10&to=2026-06-12');

        $res->assertOk()
            ->assertJsonPath('mode', 'range')
            ->assertJsonPath('from', '2026-06-10')
            ->assertJsonPath('to', '2026-06-12')
            ->assertJsonPath('listing_count', 2)
            ->assertJsonPath('trade_count', 1);

        $all = implode("\n", array_column($res->json('tweets'), 'text'));
        $this->assertStringContainsString('📢MoE Trade（6/10〜6/12）', $all);
        $this->assertStringContainsString('【期間中の取引成立数】1件', $all);
        $this->assertStringContainsString('売)過去の剣 3,000AC', $all);
        $this->assertStringContainsString('売)本日の盾 800AC', $all);
        $this->assertStringContainsString('#MasterofEpic #MoETrade', $all);
    }

    public function test_期間の逆転や片側のみの指定は422(): void
    {
        $admin = $this->makeUserWithRole('admin');

        // to が from より前
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/promo-tweets?from=2026-06-12&to=2026-06-10')
            ->assertStatus(422);
        // from のみ
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/promo-tweets?from=2026-06-10')
            ->assertStatus(422);
        // to のみ
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/promo-tweets?to=2026-06-12')
            ->assertStatus(422);
    }
}
