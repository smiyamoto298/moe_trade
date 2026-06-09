<?php

namespace Tests\Feature;

use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ItemApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_アイテム一覧と詳細は未ログインでも閲覧できる(): void
    {
        $item = $this->makeItem();

        $this->getJson('/api/items')->assertOk();
        $this->getJson("/api/items/{$item->id}")->assertOk()
            ->assertJsonPath('name', 'テストの剣');
    }

    public function test_ログインユーザーはアイテムを登録できる_unverifiedで作成される(): void
    {
        $user = $this->makeUser();
        $cats = $this->makeCategoryTree();

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/items', [
            'category_id' => $cats['sword']->id,
            'name'        => 'ユーザー登録の剣',
            'base_stats'  => ['atk' => 10],
            'mithril'     => true,
            'exclusive_skill' => true,
            'bonus_effects' => [
                [
                    'effect_name' => '剛剣の使い手',
                    'values'      => [['value' => 15, 'value_unit' => '%', 'label' => '物理ダメージ']],
                ],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('verified_status', 'unverified')
            ->assertJsonPath('mithril', true)
            ->assertJsonPath('exclusive_skill', true)
            ->assertJsonPath('submitted_by', $user->id);

        $this->assertDatabaseHas('item_bonus_effects', ['effect_name' => '剛剣の使い手']);
    }

    public function test_未ログインではアイテム登録できない(): void
    {
        $this->postJson('/api/items', ['name' => 'x'])->assertStatus(401);
    }

    public function test_本人はunverified期間のみ編集できる(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem([
            'verified_status' => 'unverified',
            'submitted_by'    => $user->id,
        ]);

        // unverified の間は本人編集可
        $this->actingAs($user, 'sanctum')
            ->putJson("/api/items/{$item->id}", ['name' => '改名後の剣'])
            ->assertOk()
            ->assertJsonPath('name', '改名後の剣');

        // verified になると本人でも編集不可
        $item->update(['verified_status' => 'verified']);
        $this->actingAs($user, 'sanctum')
            ->putJson("/api/items/{$item->id}", ['name' => '再改名'])
            ->assertStatus(403);
    }

    public function test_他人のunverifiedアイテムは編集できない(): void
    {
        $owner = $this->makeUser();
        $other = $this->makeUser();
        $item  = $this->makeItem([
            'verified_status' => 'unverified',
            'submitted_by'    => $owner->id,
        ]);

        $this->actingAs($other, 'sanctum')
            ->putJson("/api/items/{$item->id}", ['name' => '乗っ取り'])
            ->assertStatus(403);
    }

    public function test_editorはverified済みアイテムも編集できる(): void
    {
        $editor = $this->makeUserWithRole('editor');
        $item   = $this->makeItem(['verified_status' => 'verified']);

        $this->actingAs($editor, 'sanctum')
            ->putJson("/api/items/{$item->id}", ['name' => 'editor編集'])
            ->assertOk()
            ->assertJsonPath('name', 'editor編集');
    }

    public function test_確認操作はeditor以上のみ(): void
    {
        $user   = $this->makeUser();
        $editor = $this->makeUserWithRole('editor');
        $item   = $this->makeItem(['verified_status' => 'unverified']);

        // 一般ユーザーは403
        $this->actingAs($user, 'sanctum')
            ->postJson("/api/items/{$item->id}/verify")
            ->assertStatus(403);

        // editor は確認できる
        $this->actingAs($editor, 'sanctum')
            ->postJson("/api/items/{$item->id}/verify")
            ->assertOk()
            ->assertJsonPath('verified_status', 'verified');

        $this->assertSame($editor->id, $item->fresh()->verified_by);
    }

    public function test_削除はadminのみ(): void
    {
        $editor = $this->makeUserWithRole('editor');
        $admin  = $this->makeUserWithRole('admin');
        $item   = $this->makeItem();

        $this->actingAs($editor, 'sanctum')
            ->deleteJson("/api/items/{$item->id}")
            ->assertStatus(403);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/items/{$item->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('items', ['id' => $item->id]);
    }

    public function test_価格解析は無効取引も一覧に含む_統計は有効のみ(): void
    {
        $listing = $this->makeListing();

        // 有効な取引と同一IP（無効）の取引を記録
        \App\Models\TradeHistory::create([
            'listing_id' => $listing->id, 'item_id' => $listing->item_id,
            'seller_id'  => $listing->user_id, 'seller_ip' => '203.0.113.1', 'buyer_ip' => '203.0.113.2',
            'price' => 1000, 'currency' => 'AC', 'server' => 'Emerald',
            'is_valid' => true, 'traded_at' => now(),
        ]);
        \App\Models\TradeHistory::create([
            'listing_id' => $listing->id, 'item_id' => $listing->item_id,
            'seller_id'  => $listing->user_id, 'seller_ip' => '203.0.113.9', 'buyer_ip' => '203.0.113.9',
            'price' => 99999, 'currency' => 'AC', 'server' => 'Emerald',
            'is_valid' => false, 'traded_at' => now(),
        ]);

        $res = $this->getJson("/api/items/{$listing->item_id}/price-analytics");

        $res->assertOk();
        // 統計・最高値は有効データのみ（無効の99999は含まれない）
        $this->assertSame(1, $res->json('stats.deal_count'));
        $this->assertSame(1000, $res->json('stats.max'));
        // 一覧には無効分も含まれ、is_validフラグで区別できる
        $this->assertCount(2, $res->json('recent_deals'));
        $this->assertContains(false, array_column($res->json('recent_deals'), 'is_valid'));
    }

    public function test_取引履歴がないアイテムでも価格解析は0埋めで返る(): void
    {
        $item = $this->makeItem();

        $res = $this->getJson("/api/items/{$item->id}/price-analytics");

        $res->assertOk()
            ->assertJsonPath('stats.deal_count', 0)
            ->assertJsonPath('stats.min', 0);
        $this->assertSame([], $res->json('recent_deals'));
    }

    public function test_スキルアイテムは必要スキル値を保存できる(): void
    {
        $user = $this->makeUser();
        $cats = $this->makeCategoryTree();

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/items', [
            'category_id'        => $cats['noah']->id,
            'name'               => 'テストのノアピース',
            'skill_requirements' => ['刀剣' => 80, '筋力' => 50],
        ]);

        $res->assertStatus(201);
        $this->assertSame(
            ['刀剣' => 80, '筋力' => 50],
            Item::find($res->json('id'))->skill_requirements
        );
    }
}
