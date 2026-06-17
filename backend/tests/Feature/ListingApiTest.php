<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class ListingApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_装備セットは構成部位の追加効果で絞り込める(): void
    {
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        // 部位（atk=50）を持つ装備セットを出品
        $piece = $this->makeItem(['name' => 'アタッカー部位', 'category_id' => $cats['sword']->id, 'base_stats' => ['atk' => 50]]);
        $set   = $this->makeItem(['name' => 'アタックセット', 'category_id' => $equipSet->id, 'is_equipment_set' => true, 'base_stats' => []]);
        $set->setMembers()->attach($piece->id, ['sort_order' => 0]);
        $this->makeListing(null, $set);

        // atk>=40 で絞り込むと、構成部位がヒットしてセットが表示される
        $res = $this->getJson('/api/listings?' . http_build_query(['base_stat_ranges' => ['atk' => ['min' => 40]]]));
        $res->assertOk();
        $this->assertContains('アタックセット', collect($res->json('data'))->pluck('item.name')->all());

        // atk>=60 では構成部位が満たさないため表示されない
        $res2 = $this->getJson('/api/listings?' . http_build_query(['base_stat_ranges' => ['atk' => ['min' => 60]]]));
        $res2->assertOk();
        $this->assertNotContains('アタックセット', collect($res2->json('data'))->pluck('item.name')->all());
    }

    public function test_出品一覧は未ログインでも閲覧できる(): void
    {
        $this->makeListing();

        $this->getJson('/api/listings')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_種別件数エンドポイントは各種別の出品数を返す(): void
    {
        $cats  = $this->makeCategoryTree();
        $asset = ItemCategory::create(['name' => 'アセット', 'sort_order' => 3]);
        $other = ItemCategory::create(['name' => 'その他', 'sort_order' => 4]);

        // 装備品2件・テクニック1件・アセット1件・その他0件
        $this->makeListing(null, $this->makeItem(['name' => '剣A', 'category_id' => $cats['sword']->id]));
        $this->makeListing(null, $this->makeItem(['name' => '剣B', 'category_id' => $cats['sword']->id]));
        $this->makeListing(null, $this->makeItem(['name' => 'テク', 'category_id' => $cats['noah']->id]));
        $this->makeListing(null, $this->makeItem(['name' => 'アセA', 'category_id' => $asset->id]));

        $this->getJson('/api/listings/counts')
            ->assertOk()
            ->assertExactJson(['equipment' => 2, 'technique' => 1, 'asset' => 1, 'other' => 0]);
    }

    public function test_種別件数は既定では取引完了を含めずinclude_completedで含める(): void
    {
        $cats = $this->makeCategoryTree();
        $sword = $cats['sword'];

        $this->makeListing(null, $this->makeItem(['name' => '出品中', 'category_id' => $sword->id]));
        $this->makeListing(null, $this->makeItem(['name' => '完了', 'category_id' => $sword->id]), ['status' => 'completed']);

        // 既定では active のみ
        $this->getJson('/api/listings/counts')
            ->assertOk()
            ->assertJsonPath('equipment', 1);

        // include_completed=true で取引完了も含める
        $this->getJson('/api/listings/counts?include_completed=1')
            ->assertOk()
            ->assertJsonPath('equipment', 2);
    }

    public function test_種別件数は凍結ユーザーの出品を除外する(): void
    {
        $cats = $this->makeCategoryTree();
        $suspended = $this->makeUser(['is_suspended' => true]);

        $this->makeListing($suspended, $this->makeItem(['name' => '凍結出品', 'category_id' => $cats['sword']->id]));

        $this->getJson('/api/listings/counts')
            ->assertOk()
            ->assertJsonPath('equipment', 0);
    }

    public function test_不正なbase_statキーはSQLとして実行されず無視される(): void
    {
        $this->makeListing();

        // base_stats のキーは JSON パスへ文字列補間されるため、許可リスト外のキーは
        // 無視される（500 にならず、フィルタとして作用しない）。インジェクション防止の回帰テスト。
        $injection = "atk') = 1 OR JSON_EXTRACT(base_stats, '$.atk";

        $res = $this->getJson('/api/listings?' . http_build_query([
            'base_stat_keys'   => [$injection],
            'base_stat_ranges' => [$injection => ['min' => 1]],
            'sort'             => "stat_asc:{$injection}",
        ]));

        // クエリが壊れず正常応答し、出品は除外されない（不正キーは条件にならない）
        $res->assertOk()->assertJsonCount(1, 'data');
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

    public function test_出品時に削れと染色を指定できる(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/listings', [
            'item_id'    => $item->id,
            'price'      => 1000,
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'is_worn'    => true,
            'is_dyed'    => true,
            'servers'    => [['server' => 'Emerald']],
        ])->assertStatus(201);

        $res->assertJsonPath('is_worn', true)->assertJsonPath('is_dyed', true);
        $this->assertDatabaseHas('listings', ['id' => $res->json('id'), 'is_worn' => true, 'is_dyed' => true]);

        // 既定は false
        $res2 = $this->actingAs($user, 'sanctum')->postJson('/api/listings', [
            'item_id' => $item->id, 'price' => 1000, 'quantity' => 1, 'trade_type' => 'fixed',
            'servers' => [['server' => 'Emerald']],
        ])->assertStatus(201);
        $res2->assertJsonPath('is_worn', false)->assertJsonPath('is_dyed', false);
    }

    public function test_item_countsは出品を削れ染色の組み合わせ単位でも集計する(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $mk = fn(bool $worn, bool $dyed) => \App\Models\Listing::create([
            'user_id' => $user->id, 'item_id' => $item->id, 'price' => 1000, 'currency' => 'AC',
            'quantity' => 1, 'trade_type' => 'fixed', 'is_worn' => $worn, 'is_dyed' => $dyed,
            'status' => 'active', 'expires_at' => now()->addDays(7),
        ]);
        $mk(true, true);
        $mk(true, true);
        $mk(false, false);

        $variants = $this->actingAs($user, 'sanctum')
            ->getJson('/api/mypage/item-counts')->assertOk()->json('listing_variants');

        $this->assertSame(2, $variants["{$item->id}:1:1"]);
        $this->assertSame(1, $variants["{$item->id}:0:0"]);
        $this->assertArrayNotHasKey("{$item->id}:1:0", $variants);
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

    public function test_通常検索と構成検索でテクニックの絞り込みが切り替わる(): void
    {
        $cats = $this->makeCategoryTree();

        // WAR（刀剣・キック・盾・戦闘技術）を必要とするテクニック
        $warTech = Item::create([
            'category_id' => $cats['noah']->id, 'name' => 'ウォーリアー技',
            'verified_status' => 'verified', 'mastery_requirements' => ['WAR'],
        ]);
        // 刀剣のみを必要とするテクニック
        $swordTech = Item::create([
            'category_id' => $cats['noah']->id, 'name' => '刀剣の書',
            'verified_status' => 'verified', 'skill_requirements' => ['刀剣' => 50],
        ]);
        // 刀剣と料理を必要とするテクニック
        $swordCookTech = Item::create([
            'category_id' => $cats['noah']->id, 'name' => '刀剣料理の書',
            'verified_status' => 'verified', 'skill_requirements' => ['刀剣' => 50, '料理' => 30],
        ]);

        $this->makeListing(null, $warTech);
        $this->makeListing(null, $swordTech);
        $this->makeListing(null, $swordCookTech);

        // 通常検索（既定）: 刀剣 を含む必要スキルを持つもの → 刀剣の書・刀剣料理の書。WARは必要スキルが無く非表示
        $res = $this->getJson('/api/listings?' . http_build_query(['skill_keys' => ['刀剣']]));
        $res->assertOk()->assertJsonCount(2, 'data');
        $names = collect($res->json('data'))->pluck('item.name')->all();
        $this->assertContains('刀剣の書', $names);
        $this->assertContains('刀剣料理の書', $names);
        $this->assertNotContains('ウォーリアー技', $names);

        // 通常検索: 刀剣 と 料理 を両方必要とするもの（AND）→ 刀剣料理の書のみ
        $res = $this->getJson('/api/listings?' . http_build_query(['skill_keys' => ['刀剣', '料理']]));
        $res->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('刀剣料理の書', $res->json('data.0.item.name'));

        // 通常検索 + マスタリ構成スキルも対象: 刀剣 → 必要スキルに刀剣を持つ2件 + 刀剣を構成に含むWAR
        $res = $this->getJson('/api/listings?' . http_build_query([
            'skill_keys'            => ['刀剣'],
            'skill_include_mastery' => '1',
        ]));
        $res->assertOk()->assertJsonCount(3, 'data');
        $names = collect($res->json('data'))->pluck('item.name')->all();
        $this->assertContains('ウォーリアー技', $names);

        // 構成検索: 刀剣のみ選択 → 必要スキルが刀剣だけの刀剣の書のみ。
        // WARは構成スキルが揃わず、刀剣料理は料理が選択外のため非表示
        $res = $this->getJson('/api/listings?' . http_build_query([
            'skill_keys'  => ['刀剣'],
            'skill_match' => 'composition',
        ]));
        $res->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('刀剣の書', $res->json('data.0.item.name'));

        // 構成検索: WAR の全構成スキルを選択 → WARテクニック + 刀剣の書（刀剣⊆選択）。刀剣料理は料理が選択外で非表示
        $res = $this->getJson('/api/listings?' . http_build_query([
            'skill_keys'  => ['刀剣', 'キック', '盾', '戦闘技術'],
            'skill_match' => 'composition',
        ]));
        $res->assertOk()->assertJsonCount(2, 'data');
        $names = collect($res->json('data'))->pluck('item.name')->all();
        $this->assertContains('ウォーリアー技', $names);
        $this->assertContains('刀剣の書', $names);
        $this->assertNotContains('刀剣料理の書', $names);
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

    public function test_あいうえお順でソートできる(): void
    {
        $cats = $this->makeCategoryTree();
        $this->makeListing(null, $this->makeItem(['name' => 'さくら', 'category_id' => $cats['sword']->id]));
        $this->makeListing(null, $this->makeItem(['name' => 'あんず', 'category_id' => $cats['sword']->id]));
        $this->makeListing(null, $this->makeItem(['name' => 'かえで', 'category_id' => $cats['sword']->id]));

        // 昇順（あいうえお順）
        $res = $this->getJson('/api/listings?sort=name_asc');
        $names = collect($res->json('data'))->pluck('item.name')->all();
        $this->assertSame(['あんず', 'かえで', 'さくら'], $names);

        // 降順
        $res = $this->getJson('/api/listings?sort=name_desc');
        $names = collect($res->json('data'))->pluck('item.name')->all();
        $this->assertSame(['さくら', 'かえで', 'あんず'], $names);
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

    public function test_active_でも期限切れの出品は一覧に出ない(): void
    {
        // バッチが走る前（status は active のまま）でも、期限超過は一覧から除外される
        $live    = $this->makeListing(null, null, ['expires_at' => now()->addDay()]);
        $expired = $this->makeListing(null, null, ['status' => 'active', 'expires_at' => now()->subHour()]);

        $res = $this->getJson('/api/listings')->assertOk();

        $ids = collect($res->json('data'))->pluck('id')->all();
        $this->assertContains($live->id, $ids);
        $this->assertNotContains($expired->id, $ids);
    }

    public function test_active_でも期限切れの出品詳細は404(): void
    {
        $expired = $this->makeListing(null, null, ['status' => 'active', 'expires_at' => now()->subHour()]);

        $this->getJson("/api/listings/{$expired->id}")->assertNotFound();
    }

    public function test_active_でも期限切れの出品には取引希望できない(): void
    {
        $expired = $this->makeListing(null, null, ['status' => 'active', 'expires_at' => now()->subHour()]);
        $buyer   = $this->makeUser();

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$expired->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(400);
    }

    public function test_アセットは設置個所_特殊機能_ストレージ数で絞り込める(): void
    {
        $assetTop = ItemCategory::create(['name' => 'アセット', 'sort_order' => 8]);

        // 床・銀行・ストレージ20 のアセットと、壁・販売員・ストレージ5 のアセットを出品
        $bank = $this->makeItem([
            'name' => '銀行アセット', 'category_id' => $assetTop->id,
            'placement' => '床', 'special_function' => '銀行', 'storage_count' => 20,
        ]);
        $shop = $this->makeItem([
            'name' => '販売員アセット', 'category_id' => $assetTop->id,
            'placement' => '壁', 'special_function' => '販売員', 'storage_count' => 5,
        ]);
        $this->makeListing(null, $bank);
        $this->makeListing(null, $shop);

        $names = fn($res) => collect($res->json('data'))->pluck('item.name')->all();

        // 設置個所=床 で銀行アセットのみ
        $res = $this->getJson('/api/listings?' . http_build_query(['item_type' => 'asset', 'placements' => ['床']]));
        $res->assertOk();
        $this->assertSame(['銀行アセット'], $names($res));

        // 特殊機能=販売員 で販売員アセットのみ
        $res2 = $this->getJson('/api/listings?' . http_build_query(['item_type' => 'asset', 'special_functions' => ['販売員']]));
        $res2->assertOk();
        $this->assertSame(['販売員アセット'], $names($res2));

        // ストレージ数 >=10 で銀行アセットのみ
        $res3 = $this->getJson('/api/listings?' . http_build_query(['item_type' => 'asset', 'storage_min' => 10]));
        $res3->assertOk();
        $this->assertSame(['銀行アセット'], $names($res3));
    }

    public function test_その他種別は専用タブで絞り込め装備品タブには出ない(): void
    {
        $cats     = $this->makeCategoryTree();
        $otherTop = ItemCategory::create(['name' => 'その他', 'sort_order' => 9]);
        $recipe   = ItemCategory::create(['name' => 'レシピ', 'parent_id' => $otherTop->id, 'sort_order' => 1]);

        $sword     = $this->makeItem(['name' => '普通の剣', 'category_id' => $cats['sword']->id]);
        $recipeItem = $this->makeItem(['name' => '上級ポーションのレシピ', 'category_id' => $recipe->id, 'recipe_name' => '上級ポーション', 'recipe_binder' => '薬調合']);
        $this->makeListing(null, $sword);
        $this->makeListing(null, $recipeItem);

        $names = fn($res) => collect($res->json('data'))->pluck('item.name')->all();

        // その他タブにはレシピのみ
        $other = $this->getJson('/api/listings?' . http_build_query(['item_type' => 'other']));
        $other->assertOk();
        $this->assertSame(['上級ポーションのレシピ'], $names($other));

        // 装備品タブにはその他（レシピ）は出ない
        $equipment = $this->getJson('/api/listings?' . http_build_query(['item_type' => 'equipment']));
        $equipment->assertOk();
        $this->assertSame(['普通の剣'], $names($equipment));
    }

    public function test_その他タブはレシピを必要スキル値で絞り込める(): void
    {
        $otherTop = ItemCategory::create(['name' => 'その他', 'sort_order' => 9]);
        $recipe   = ItemCategory::create(['name' => 'レシピ', 'parent_id' => $otherTop->id, 'sort_order' => 1]);

        // 薬調合70 が必要なレシピと、料理40 のみのレシピ
        $potion = $this->makeItem(['name' => '上級ポーションのレシピ', 'category_id' => $recipe->id, 'skill_requirements' => ['薬調合' => 70]]);
        $bread  = $this->makeItem(['name' => 'パンのレシピ', 'category_id' => $recipe->id, 'skill_requirements' => ['料理' => 40]]);
        $this->makeListing(null, $potion);
        $this->makeListing(null, $bread);

        $names = fn($res) => collect($res->json('data'))->pluck('item.name')->all();

        // 薬調合を必要とするレシピのみ
        $res = $this->getJson('/api/listings?' . http_build_query([
            'item_type'  => 'other',
            'skill_keys' => ['薬調合'],
        ]));
        $res->assertOk();
        $this->assertSame(['上級ポーションのレシピ'], $names($res));

        // 数値範囲（薬調合 <= 50）で絞ると該当なし
        $res2 = $this->getJson('/api/listings?' . http_build_query([
            'item_type'    => 'other',
            'skill_keys'   => ['薬調合'],
            'skill_ranges' => ['薬調合' => ['max' => 50]],
        ]));
        $res2->assertOk();
        $this->assertSame([], $names($res2));
    }

    public function test_出品詳細は出品中と取引成立のみ公開され他は404(): void
    {
        // active は閲覧可
        $active = $this->makeListing(null, null, ['status' => 'active']);
        $this->getJson("/api/listings/{$active->id}")
            ->assertOk()
            ->assertJsonPath('id', $active->id);

        // completed も公開対象
        $completed = $this->makeListing(null, null, ['status' => 'completed']);
        $this->getJson("/api/listings/{$completed->id}")
            ->assertOk()
            ->assertJsonPath('id', $completed->id);

        // 取り下げ・期限切れは直接URLでも閲覧できない（404）
        foreach (['cancelled', 'expired', 'deal_failed'] as $status) {
            $hidden = $this->makeListing(null, null, ['status' => $status]);
            $this->getJson("/api/listings/{$hidden->id}")
                ->assertStatus(404);
        }
    }
}
