<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemCategory;
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

    public function test_装備セットは部位アイテムを生成してメンバーに紐付ける(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/items', [
            'category_id'      => $equipSet->id,
            'name'             => '炎のセット',
            'is_equipment_set' => true,
            'pieces' => [
                [
                    'category_id'   => $cats['sword']->id,
                    'name'          => '炎の剣',
                    'base_stats'    => ['atk' => 10],
                    'bonus_effects' => [
                        ['effect_name' => '炎纏い', 'values' => [['value' => 5, 'value_unit' => '%', 'label' => '火力']]],
                    ],
                ],
                [
                    'category_id' => $cats['sword']->id,
                    'name'        => '炎の盾',
                    'base_stats'  => ['atk' => 3],
                ],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('is_equipment_set', true)
            ->assertJsonCount(2, 'set_members');

        $setId = $res->json('id');
        // 部位は通常アイテムとして作成される
        $this->assertDatabaseHas('items', ['name' => '炎の剣', 'is_equipment_set' => false]);
        $this->assertDatabaseHas('items', ['name' => '炎の盾']);
        $this->assertDatabaseCount('equipment_set_members', 2);
        $this->assertDatabaseHas('item_bonus_effects', ['effect_name' => '炎纏い']);
        // 派生キャッシュ（部位カテゴリ）が更新される
        $this->assertEqualsCanonicalizing([$cats['sword']->id], Item::find($setId)->set_piece_category_ids);
    }

    public function test_装備セット更新で部位を更新追加除外できる_除外部位は削除されない(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        $create = $this->actingAs($admin, 'sanctum')->postJson('/api/items', [
            'category_id'      => $equipSet->id,
            'name'             => 'セットA',
            'is_equipment_set' => true,
            'pieces' => [
                ['category_id' => $cats['sword']->id, 'name' => '部位1'],
                ['category_id' => $cats['sword']->id, 'name' => '部位2'],
            ],
        ])->assertStatus(201);

        $setId    = $create->json('id');
        $piece1Id = $create->json('set_members.0.id');

        // 部位1を改名し残す / 部位2を除外 / 部位3を追加
        $res = $this->actingAs($admin, 'sanctum')->putJson("/api/items/{$setId}", [
            'is_equipment_set' => true,
            'pieces' => [
                ['id' => $piece1Id, 'category_id' => $cats['sword']->id, 'name' => '部位1改'],
                ['category_id' => $cats['sword']->id, 'name' => '部位3'],
            ],
        ]);

        $res->assertOk()->assertJsonCount(2, 'set_members');
        $this->assertDatabaseHas('items', ['id' => $piece1Id, 'name' => '部位1改']);
        // 除外された部位2は detach のみ。通常アイテムとして残る。
        $this->assertDatabaseHas('items', ['name' => '部位2']);
        $this->assertDatabaseCount('equipment_set_members', 2);
    }

    public function test_装備セットの部位名が重複すると422(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/items', [
            'category_id'      => $equipSet->id,
            'name'             => 'セットB',
            'is_equipment_set' => true,
            'pieces' => [
                ['category_id' => $cats['sword']->id, 'name' => '同名部位'],
                ['category_id' => $cats['sword']->id, 'name' => '同名部位'],
            ],
        ])->assertStatus(422);
    }

    public function test_装備セットの部位は付加効果ごとに専用技を保存できる(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/items', [
            'category_id'      => $equipSet->id,
            'name'             => '専用技セット',
            'is_equipment_set' => true,
            'pieces' => [
                [
                    'category_id'     => $cats['sword']->id,
                    'name'            => '専用技の剣',
                    'exclusive_skill' => true,
                    'bonus_effects'   => [
                        ['effect_name' => '秘剣', 'is_exclusive' => true, 'values' => []],
                        ['effect_name' => '通常効果', 'is_exclusive' => false, 'values' => []],
                    ],
                ],
            ],
        ]);

        $res->assertStatus(201);
        $this->assertDatabaseHas('item_bonus_effects', ['effect_name' => '秘剣', 'is_exclusive' => true]);
        $this->assertDatabaseHas('item_bonus_effects', ['effect_name' => '通常効果', 'is_exclusive' => false]);
        // show / set_members で付加効果ごとの is_exclusive が返る
        $effects = collect($res->json('set_members.0.bonus_effects'));
        $this->assertTrue((bool) $effects->firstWhere('effect_name', '秘剣')['is_exclusive']);
        $this->assertFalse((bool) $effects->firstWhere('effect_name', '通常効果')['is_exclusive']);
    }

    public function test_装備セット更新で他アイテムのidを渡しても乗っ取れない(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        // 無関係なアイテム（セットの部位ではない）
        $victim = $this->makeItem(['name' => '無関係アイテム', 'category_id' => $cats['sword']->id]);

        $create = $this->actingAs($admin, 'sanctum')->postJson('/api/items', [
            'category_id'      => $equipSet->id,
            'name'             => '乗っ取りテストセット',
            'is_equipment_set' => true,
            'pieces' => [
                ['category_id' => $cats['sword']->id, 'name' => '正規部位'],
            ],
        ])->assertStatus(201);
        $setId = $create->json('id');

        // victim->id を piece.id として渡す。乗っ取られず、victim 名は変わらないこと。
        $this->actingAs($admin, 'sanctum')->putJson("/api/items/{$setId}", [
            'is_equipment_set' => true,
            'pieces' => [
                ['id' => $victim->id, 'category_id' => $cats['sword']->id, 'name' => '乗っ取り後の名前'],
            ],
        ])->assertOk();

        // victim は無傷
        $this->assertDatabaseHas('items', ['id' => $victim->id, 'name' => '無関係アイテム']);
        // victim はセットのメンバーにもなっていない
        $this->assertDatabaseMissing('equipment_set_members', ['set_item_id' => $setId, 'piece_item_id' => $victim->id]);
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
