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

        $res->assertOk()
            ->assertJsonPath('date', '2026-06-12')
            ->assertJsonPath('trade_count', 2)
            ->assertJsonPath('listing_count', 1)
            ->assertJsonPath('buy_request_count', 1);

        $all = implode("\n", array_column($res->json('tweets'), 'text'));
        $this->assertStringContainsString('【本日の取引件数】2件', $all);
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

    public function test_date指定で過去日の文面を生成できる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        // 当日に1件出品があっても、過去日を指定すれば含まれない
        $this->makeListing($this->makeUser(), $this->makeItem(['name' => '当日の剣']));

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/promo-tweets?date=2026-06-10');

        $res->assertOk()
            ->assertJsonPath('date', '2026-06-10')
            ->assertJsonPath('listing_count', 0)
            ->assertJsonPath('trade_count', 0);
        $all = implode("\n", array_column($res->json('tweets'), 'text'));
        $this->assertStringNotContainsString('当日の剣', $all);
        $this->assertStringContainsString('新着の出品・買取はなし', $all);
    }

    public function test_不正な日付形式は422(): void
    {
        $this->actingAs($this->makeUserWithRole('admin'), 'sanctum')
            ->getJson('/api/admin/promo-tweets?date=2026/06/10')
            ->assertStatus(422);
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
        $this->assertStringContainsString('【期間中の取引件数】1件', $all);
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
