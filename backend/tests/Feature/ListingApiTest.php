<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class ListingApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_出品一覧は未ログインでも閲覧できる(): void
    {
        $this->makeListing();

        $this->getJson('/api/listings')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_出品できる_期限は7日後(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/listings', [
            'item_id'    => $item->id,
            'price'      => 5000,
            'quantity'   => 2,
            'trade_type' => 'negotiable',
            'comment'    => 'よろしくお願いします',
            'servers'    => [['server' => 'Emerald'], ['server' => 'Pearl']],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('price', 5000)
            ->assertJsonPath('currency', 'AC')
            ->assertJsonCount(2, 'servers');

        $expiresAt = \App\Models\Listing::find($res->json('id'))->expires_at;
        $this->assertTrue(now()->addDays(6)->lt($expiresAt) && now()->addDays(8)->gt($expiresAt));
    }

    public function test_メール未認証ユーザーは出品できない(): void
    {
        $user = User::factory()->unverified()->create();
        $item = $this->makeItem();

        $this->actingAs($user, 'sanctum')->postJson('/api/listings', [
            'item_id'    => $item->id,
            'price'      => 100,
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'servers'    => [['server' => 'Emerald']],
        ])->assertStatus(403);
    }

    public function test_停止中ユーザーは出品できない(): void
    {
        $user = $this->makeUser(['is_suspended' => true]);
        $item = $this->makeItem();

        $this->actingAs($user, 'sanctum')->postJson('/api/listings', [
            'item_id'    => $item->id,
            'price'      => 100,
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'servers'    => [['server' => 'Emerald']],
        ])->assertStatus(403);
    }

    public function test_停止中ユーザーの出品は一覧に表示されない(): void
    {
        $suspended = $this->makeUser(['is_suspended' => true]);
        $this->makeListing($suspended);
        $this->makeListing(); // 正常ユーザーの出品

        $this->getJson('/api/listings')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_is_skillパラメータで装備品とスキルを絞り込める(): void
    {
        $cats = $this->makeCategoryTree();

        $sword = Item::create(['category_id' => $cats['sword']->id, 'name' => '剣', 'verified_status' => 'verified']);
        $noah  = Item::create(['category_id' => $cats['noah']->id, 'name' => 'ノアピース・リコール', 'verified_status' => 'verified']);

        $this->makeListing(null, $sword);
        $this->makeListing(null, $noah);

        $skillRes = $this->getJson('/api/listings?is_skill=1');
        $skillRes->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('ノアピース・リコール', $skillRes->json('data.0.item.name'));

        $equipRes = $this->getJson('/api/listings?is_skill=0');
        $equipRes->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('剣', $equipRes->json('data.0.item.name'));
    }

    public function test_必要スキル値で絞り込める(): void
    {
        $cats = $this->makeCategoryTree();

        $sword80 = Item::create([
            'category_id' => $cats['noah']->id, 'name' => '刀剣の書80',
            'verified_status' => 'verified', 'skill_requirements' => ['刀剣' => 80],
        ]);
        $sword30 = Item::create([
            'category_id' => $cats['noah']->id, 'name' => '刀剣の書30',
            'verified_status' => 'verified', 'skill_requirements' => ['刀剣' => 30],
        ]);
        $cooking = Item::create([
            'category_id' => $cats['noah']->id, 'name' => '料理の書',
            'verified_status' => 'verified', 'skill_requirements' => ['料理' => 50],
        ]);

        $this->makeListing(null, $sword80);
        $this->makeListing(null, $sword30);
        $this->makeListing(null, $cooking);

        // スキル名のみ指定 → 刀剣を必要とする2件
        $res = $this->getJson('/api/listings?' . http_build_query(['skill_keys' => ['刀剣']]));
        $res->assertOk()->assertJsonCount(2, 'data');

        // 範囲指定（刀剣 50〜100）→ 80のみ
        $res = $this->getJson('/api/listings?' . http_build_query([
            'skill_keys'   => ['刀剣'],
            'skill_ranges' => ['刀剣' => ['min' => 50, 'max' => 100]],
        ]));
        $res->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('刀剣の書80', $res->json('data.0.item.name'));
    }

    public function test_価格でフィルタとソートができる(): void
    {
        $this->makeListing(null, null, ['price' => 100]);
        $this->makeListing(null, null, ['price' => 5000]);
        $this->makeListing(null, null, ['price' => 90000]);

        // 価格帯フィルター（フロントが送る price_min / price_max 形式）
        $this->getJson('/api/listings?price_min=1000&price_max=10000')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.price', 5000);

        // 価格昇順ソート
        $res = $this->getJson('/api/listings?sort=price_asc');
        $this->assertSame([100, 5000, 90000], array_column($res->json('data'), 'price'));
    }

    public function test_本人は出品を編集できる_他人は編集できない(): void
    {
        $seller  = $this->makeUser();
        $other   = $this->makeUser();
        $listing = $this->makeListing($seller);

        $this->actingAs($seller, 'sanctum')
            ->putJson("/api/listings/{$listing->id}", ['price' => 2000])
            ->assertOk()
            ->assertJsonPath('price', 2000);

        $this->actingAs($other, 'sanctum')
            ->putJson("/api/listings/{$listing->id}", ['price' => 1])
            ->assertStatus(403);
    }

    public function test_本人は出品を取り下げできる(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeListing($seller);

        $this->actingAs($seller, 'sanctum')
            ->deleteJson("/api/listings/{$listing->id}")
            ->assertStatus(204);

        $this->assertSame('cancelled', $listing->fresh()->status);
    }

    public function test_renewで期限が延長されactiveに戻る(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeListing($seller, null, [
            'status'     => 'expired',
            'expires_at' => now()->subDay(),
        ]);

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/renew")
            ->assertOk();

        $fresh = $listing->fresh();
        $this->assertSame('active', $fresh->status);
        $this->assertTrue($fresh->expires_at->gt(now()->addDays(6)));
    }

    public function test_期限切れバッチで出品がexpiredになる(): void
    {
        $expired = $this->makeListing(null, null, ['expires_at' => now()->subHour()]);
        $active  = $this->makeListing(null, null, ['expires_at' => now()->addDay()]);

        Artisan::call('listings:expire');

        $this->assertSame('expired', $expired->fresh()->status);
        $this->assertSame('active', $active->fresh()->status);
    }
}
