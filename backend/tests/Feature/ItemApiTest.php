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

    public function test_アイテム一覧はper_pageで件数指定でき全ページで全件取得できる(): void
    {
        $cats = $this->makeCategoryTree();
        foreach (range(1, 3) as $i) {
            $this->makeItem(['category_id' => $cats['sword']->id, 'name' => "テストの剣{$i}"]);
        }

        // per_page が反映され、last_page で総ページ数がわかる
        $page1 = $this->getJson('/api/items?per_page=2')->assertOk()->json();
        $this->assertSame(2, $page1['per_page']);
        $this->assertSame(2, $page1['last_page']);
        $this->assertCount(2, $page1['data']);

        // 最終ページに残り全件が入る（1ページ目しか見ないと51件目以降が漏れるバグの回帰防止）
        $page2 = $this->getJson('/api/items?per_page=2&page=2')->assertOk()->json();
        $this->assertCount(1, $page2['data']);

        // 上限 200 / 下限 1 にクランプされる
        $this->assertSame(200, $this->getJson('/api/items?per_page=9999')->assertOk()->json('per_page'));
        $this->assertSame(1, $this->getJson('/api/items?per_page=0')->assertOk()->json('per_page'));
    }

    public function test_アイテム一覧は募集中の出品数と買取数を返す(): void
    {
        $item  = $this->makeItem();
        $other = $this->makeItem(['name' => '別の剣']);

        // 募集中（active）の出品 2件 + 終了済み 1件（集計対象外）
        $this->makeListing(null, $item);
        $this->makeListing(null, $item);
        $this->makeListing(null, $item, ['status' => 'completed']);

        // 募集中の買取 1件
        \App\Models\BuyRequest::create([
            'user_id'    => $this->makeUser()->id,
            'item_id'    => $item->id,
            'price'      => 500,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'status'     => 'active',
            'expires_at' => now()->addDays(7),
        ]);

        $data = collect($this->getJson('/api/items')->assertOk()->json('data'));

        $target = $data->firstWhere('id', $item->id);
        $this->assertSame(2, $target['active_listing_count']);
        $this->assertSame(1, $target['active_buy_request_count']);

        // 取引のないアイテムは 0 を返す
        $empty = $data->firstWhere('id', $other->id);
        $this->assertSame(0, $empty['active_listing_count']);
        $this->assertSame(0, $empty['active_buy_request_count']);
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
            'bonus_effects' => [
                [
                    'effect_name'  => '剛剣の使い手',
                    'is_exclusive' => true,
                    'values'       => [['value' => 15, 'value_unit' => '%', 'label' => '物理ダメージ']],
                ],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('verified_status', 'unverified')
            ->assertJsonPath('mithril', true)
            ->assertJsonPath('submitted_by', $user->id)
            // 専用技は付加効果単位（is_exclusive）で保持する（アイテム単位の exclusive_skill は廃止）
            ->assertJsonPath('bonus_effects.0.is_exclusive', true);

        $this->assertDatabaseHas('item_bonus_effects', ['effect_name' => '剛剣の使い手', 'is_exclusive' => true]);
    }

    public function test_付加効果の値はテキスト_確認中の単位で保存できる(): void
    {
        $user = $this->makeUser();
        $cats = $this->makeCategoryTree();

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/items', [
            'category_id' => $cats['sword']->id,
            'name'        => 'テキスト・確認中の剣',
            'bonus_effects' => [
                [
                    'effect_name' => '謎の力',
                    'values'      => [
                        // text: 数値ではなく文字列をそのまま保持する
                        ['value' => '状況により変動', 'value_unit' => 'text', 'label' => '特殊効果'],
                        // checking: 項目名のみ。値は空でも除外されず確認中として保存される
                        ['value' => '', 'value_unit' => 'checking', 'label' => '隠し効果'],
                    ],
                ],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('bonus_effects.0.values.0.value_unit', 'text')
            ->assertJsonPath('bonus_effects.0.values.0.value', '状況により変動')
            ->assertJsonPath('bonus_effects.0.values.1.value_unit', 'checking')
            ->assertJsonPath('bonus_effects.0.values.1.label', '隠し効果');

        // checking の項目名も候補テーブルに自動追加される
        $this->assertDatabaseHas('bonus_value_labels', ['label' => '隠し効果']);
    }

    public function test_未ログインではアイテム登録できない(): void
    {
        $this->postJson('/api/items', ['name' => 'x'])->assertStatus(401);
    }

    public function test_editorはverifiedフラグで確認済み_確認中を選んで登録できる(): void
    {
        $editor = $this->makeUserWithRole('editor');
        $cats   = $this->makeCategoryTree();

        // verified=true → 確認済み（verified_by・locked_by_staff も立つ）
        $this->actingAs($editor, 'sanctum')->postJson('/api/items', [
            'category_id' => $cats['sword']->id,
            'name'        => 'editorの確認済みの剣',
            'verified'    => true,
        ])->assertStatus(201)
            ->assertJsonPath('verified_status', 'verified')
            ->assertJsonPath('verified_by', $editor->id)
            ->assertJsonPath('locked_by_staff', true);

        // verified=false → 確認中
        $this->actingAs($editor, 'sanctum')->postJson('/api/items', [
            'category_id' => $cats['sword']->id,
            'name'        => 'editorの確認中の剣',
            'verified'    => false,
        ])->assertStatus(201)
            ->assertJsonPath('verified_status', 'unverified')
            ->assertJsonPath('verified_by', null)
            ->assertJsonPath('locked_by_staff', false);
    }

    public function test_adminもverifiedフラグで確認中を選んで登録できる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $cats  = $this->makeCategoryTree();

        $this->actingAs($admin, 'sanctum')->postJson('/api/items', [
            'category_id' => $cats['sword']->id,
            'name'        => 'adminの確認中の剣',
            'verified'    => false,
        ])->assertStatus(201)
            ->assertJsonPath('verified_status', 'unverified')
            ->assertJsonPath('locked_by_staff', false);
    }

    public function test_一般ユーザーはverifiedフラグを送っても確認中になる(): void
    {
        $user = $this->makeUser();
        $cats = $this->makeCategoryTree();

        // 権限の無いユーザーが verified=true を送っても無視される
        $this->actingAs($user, 'sanctum')->postJson('/api/items', [
            'category_id' => $cats['sword']->id,
            'name'        => '一般ユーザーが確認済みを偽装した剣',
            'verified'    => true,
        ])->assertStatus(201)
            ->assertJsonPath('verified_status', 'unverified')
            ->assertJsonPath('verified_by', null);
    }

    public function test_verified未指定なら従来通りadminは確認済み_editorは確認中(): void
    {
        $cats = $this->makeCategoryTree();

        $admin = $this->makeUserWithRole('admin');
        $this->actingAs($admin, 'sanctum')->postJson('/api/items', [
            'category_id' => $cats['sword']->id,
            'name'        => 'admin既定の剣',
        ])->assertStatus(201)
            ->assertJsonPath('verified_status', 'verified');

        $editor = $this->makeUserWithRole('editor');
        $this->actingAs($editor, 'sanctum')->postJson('/api/items', [
            'category_id' => $cats['sword']->id,
            'name'        => 'editor既定の剣',
        ])->assertStatus(201)
            ->assertJsonPath('verified_status', 'unverified');
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

    public function test_確認済みを確認中に戻せるのはeditor以上のみ(): void
    {
        $user   = $this->makeUser();
        $editor = $this->makeUserWithRole('editor');
        $item   = $this->makeItem([
            'verified_status' => 'verified',
            'verified_by'     => $editor->id,
            'verified_at'     => now(),
            'locked_by_staff' => true,
        ]);

        // 一般ユーザーは403
        $this->actingAs($user, 'sanctum')
            ->postJson("/api/items/{$item->id}/unverify")
            ->assertStatus(403);

        // editor は確認中に戻せる（verified_by/at はクリア・staffロックは維持）
        $this->actingAs($editor, 'sanctum')
            ->postJson("/api/items/{$item->id}/unverify")
            ->assertOk()
            ->assertJsonPath('verified_status', 'unverified')
            ->assertJsonPath('verified_by', null);

        $fresh = $item->fresh();
        $this->assertNull($fresh->verified_at);
        $this->assertTrue((bool) $fresh->locked_by_staff);
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

    public function test_関連データのある削除は確認を要求しforceで連鎖削除する(): void
    {
        $admin   = $this->makeUserWithRole('admin');
        $listing = $this->makeListing();
        $itemId  = $listing->item_id;

        // 出品に紐づくチャット・メッセージ・取引履歴を用意
        $chat = \App\Models\TradeChat::create([
            'listing_id' => $listing->id,
            'buyer_id'   => $this->makeUser()->id,
            'server'     => 'Emerald',
            'status'     => 'open',
        ]);
        $chat->messages()->create(['user_id' => $chat->buyer_id, 'message' => 'よろしく']);
        \App\Models\TradeHistory::create([
            'listing_id' => $listing->id, 'item_id' => $itemId,
            'seller_id'  => $listing->user_id, 'price' => 1000, 'currency' => 'AC',
            'server' => 'Emerald', 'is_valid' => true, 'traded_at' => now(),
        ]);

        // 同じアイテムへの買取（buy_requests は item を RESTRICT 参照）と、それに紐づくチャット。
        // これが残っていると items 削除が FK 制約違反で 500 になっていた（回帰防止）。
        $buyRequest = \App\Models\BuyRequest::create([
            'user_id'    => $this->makeUser()->id,
            'item_id'    => $itemId,
            'price'      => 800, 'currency' => 'AC', 'quantity' => 1,
            'trade_type' => 'fixed', 'expires_at' => now()->addMonth(),
        ]);
        $brChat = \App\Models\TradeChat::create([
            'buy_request_id' => $buyRequest->id,
            'buyer_id'       => $this->makeUser()->id,
            'server'         => 'Emerald',
            'status'         => 'open',
        ]);

        // force 未指定なら 409 で確認を要求し、件数を返す（削除はしない）
        $res = $this->actingAs($admin, 'sanctum')->deleteJson("/api/items/{$itemId}");
        $res->assertStatus(409)
            ->assertJsonPath('requires_confirmation', true)
            ->assertJsonPath('listing_count', 1)
            ->assertJsonPath('buy_request_count', 1)
            ->assertJsonPath('history_count', 1);
        $this->assertDatabaseHas('items', ['id' => $itemId]);

        // force=1 で関連（出品・買取・チャット・メッセージ・取引履歴）ごと削除
        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/items/{$itemId}?force=1")
            ->assertStatus(204);

        $this->assertDatabaseMissing('items', ['id' => $itemId]);
        $this->assertDatabaseMissing('listings', ['id' => $listing->id]);
        $this->assertDatabaseMissing('trade_chats', ['id' => $chat->id]);
        $this->assertDatabaseMissing('trade_history', ['item_id' => $itemId]);
        $this->assertDatabaseMissing('buy_requests', ['id' => $buyRequest->id]);
        $this->assertDatabaseMissing('trade_chats', ['id' => $brChat->id]);
    }

    public function test_アイテム統合で関連データを付け替えて元を削除する(): void
    {
        $admin   = $this->makeUserWithRole('admin');
        $listing = $this->makeListing();
        $source  = $listing->item;
        $target  = $this->makeItem(['name' => '統合先の剣']);

        \App\Models\TradeHistory::create([
            'listing_id' => $listing->id, 'item_id' => $source->id,
            'seller_id'  => $listing->user_id, 'price' => 1000, 'currency' => 'AC',
            'server' => 'Emerald', 'is_valid' => true, 'traded_at' => now(),
        ]);

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/items/{$source->id}/merge", ['target_id' => $target->id]);

        $res->assertOk()
            ->assertJsonPath('merged_into.id', $target->id)
            ->assertJsonPath('listing_count', 1)
            ->assertJsonPath('history_count', 1);

        // 元アイテムは削除され、出品・履歴は統合先に付け替わる
        $this->assertDatabaseMissing('items', ['id' => $source->id]);
        $this->assertDatabaseHas('listings', ['id' => $listing->id, 'item_id' => $target->id]);
        $this->assertDatabaseHas('trade_history', ['listing_id' => $listing->id, 'item_id' => $target->id]);
    }

    public function test_同じアイテムへの統合は422(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $item  = $this->makeItem();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/items/{$item->id}/merge", ['target_id' => $item->id])
            ->assertStatus(422);
    }

    public function test_統合はadminのみ(): void
    {
        $editor = $this->makeUserWithRole('editor');
        $a = $this->makeItem(['name' => 'A']);
        $b = $this->makeItem(['name' => 'B']);

        $this->actingAs($editor, 'sanctum')
            ->postJson("/api/items/{$a->id}/merge", ['target_id' => $b->id])
            ->assertStatus(403);
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

    public function test_価格解析の募集一覧は各行の詳細リンク用にidを返す(): void
    {
        // 同一アイテムへの出品と買取をそれぞれ作成
        $item    = $this->makeItem();
        $listing = $this->makeListing(null, $item);
        $buyer   = $this->makeUser();
        $buyRequest = \App\Models\BuyRequest::create([
            'user_id'    => $buyer->id, 'item_id' => $item->id,
            'price'      => 500, 'currency' => 'AC', 'quantity' => 1,
            'trade_type' => 'fixed', 'expires_at' => now()->addMonth(),
        ]);

        $res = $this->getJson("/api/items/{$item->id}/price-analytics");
        $res->assertOk();

        // 出品（売り相場）の募集一覧は出品idを含む
        $this->assertSame($listing->id, $res->json('recent_listings.0.id'));
        $this->assertSame($listing->id, $res->json('sell.recent_offers.0.id'));
        // 買取（買い相場）の募集一覧は買取idを含む
        $this->assertSame($buyRequest->id, $res->json('buy.recent_offers.0.id'));
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

    public function test_一般ユーザーは構成部位なしで装備セットを登録できる(): void
    {
        $user     = $this->makeUser();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        // 構成部位は管理者に任せる想定で、pieces 空でも登録できる
        $res = $this->actingAs($user, 'sanctum')->postJson('/api/items', [
            'category_id'      => $equipSet->id,
            'name'             => '部位未設定セット',
            'is_equipment_set' => true,
            'pieces'           => [],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('is_equipment_set', true)
            ->assertJsonCount(0, 'set_members')
            ->assertJsonPath('verified_status', 'unverified');
    }

    public function test_装備セットの部位を付け替えるとセットの構成も統合先に切り替わる(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        $create = $this->actingAs($admin, 'sanctum')->postJson('/api/items', [
            'category_id'      => $equipSet->id,
            'name'             => '付け替えセット',
            'is_equipment_set' => true,
            'pieces' => [
                ['category_id' => $cats['sword']->id, 'name' => '旧部位'],
            ],
        ])->assertStatus(201);
        $setId   = $create->json('id');
        $pieceId = $create->json('set_members.0.id');

        // 付け替え先（重複扱いの別アイテム）
        $target = $this->makeItem(['name' => '正部位', 'category_id' => $cats['sword']->id]);

        // 旧部位 → 正部位 へ付け替え
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/items/{$pieceId}/merge", ['target_id' => $target->id])
            ->assertOk()
            ->assertJsonPath('set_member_count', 1);

        // 旧部位は削除され、セットは付け替え先を参照する（黙って外れない）
        $this->assertDatabaseMissing('items', ['id' => $pieceId]);
        $this->assertDatabaseHas('equipment_set_members', ['set_item_id' => $setId, 'piece_item_id' => $target->id]);
        $show = $this->getJson("/api/items/{$setId}")->assertOk();
        $this->assertEqualsCanonicalizing([$target->id], collect($show->json('set_members'))->pluck('id')->all());
    }

    public function test_装備セットの部位削除は確認を要求しセットから外れる(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        $create = $this->actingAs($admin, 'sanctum')->postJson('/api/items', [
            'category_id'      => $equipSet->id,
            'name'             => '削除テストセット',
            'is_equipment_set' => true,
            'pieces' => [
                ['category_id' => $cats['sword']->id, 'name' => '部位A'],
                ['category_id' => $cats['sword']->id, 'name' => '部位B'],
            ],
        ])->assertStatus(201);
        $setId    = $create->json('id');
        $pieceAId = $create->json('set_members.0.id');

        // 出品も履歴も無いが、セット参加のため確認を要求（409）
        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/items/{$pieceAId}")
            ->assertStatus(409)
            ->assertJsonPath('set_usage_count', 1);

        // force で削除 → セットから外れ、メンバーは1件に
        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/items/{$pieceAId}?force=1")
            ->assertStatus(204);

        $this->assertDatabaseMissing('equipment_set_members', ['set_item_id' => $setId, 'piece_item_id' => $pieceAId]);
        $this->assertDatabaseCount('equipment_set_members', 1);
    }

    public function test_部位アイテムを装備セットへ変換すると自身が構成部位として残り出品も保持される(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        // 出品のある通常の部位アイテム
        $piece = $this->makeItem(['name' => '炎の大剣', 'category_id' => $cats['sword']->id, 'base_stats' => ['atk' => 10]]);
        $listing = $this->makeListing(null, $piece);

        $res = $this->actingAs($admin, 'sanctum')->postJson("/api/items/{$piece->id}/convert-to-set", [
            'category_id' => $equipSet->id,
            'name'        => '炎の大剣セット', // セット本体名（部位名とは別にする）
            'pieces'      => [
                [
                    'id'          => $piece->id, // 自身を既存部位として採用
                    'category_id' => $cats['sword']->id,
                    'name'        => '炎の大剣',
                    'base_stats'  => ['atk' => 10],
                    'bonus_effects' => [
                        ['effect_name' => '炎の魔剣', 'is_exclusive' => true, 'values' => []],
                    ],
                ],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('is_equipment_set', true)
            ->assertJsonPath('name', '炎の大剣セット');

        $setId = $res->json('id');
        // 新しいセット本体が作られ、元アイテムが構成部位として紐付く（id・出品は保持）
        $this->assertNotSame($piece->id, $setId);
        $this->assertDatabaseHas('equipment_set_members', ['set_item_id' => $setId, 'piece_item_id' => $piece->id]);
        // 元アイテムは通常アイテムのまま残る（削除されない・セット化されない）
        $piece->refresh();
        $this->assertFalse($piece->is_equipment_set);
        // 出品は元アイテム(部位)に紐づいたまま
        $this->assertDatabaseHas('listings', ['id' => $listing->id, 'item_id' => $piece->id]);
        // 部位の付加効果（専用技）が保存される
        $this->assertDatabaseHas('item_bonus_effects', ['item_id' => $piece->id, 'effect_name' => '炎の魔剣', 'is_exclusive' => true]);
    }

    public function test_変換元以外のidを構成部位に渡しても採用されない(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $cats     = $this->makeCategoryTree();
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);

        $piece = $this->makeItem(['name' => '変換元の剣', 'category_id' => $cats['sword']->id]);
        $victim = $this->makeItem(['name' => '無関係の剣', 'category_id' => $cats['sword']->id]);

        $res = $this->actingAs($admin, 'sanctum')->postJson("/api/items/{$piece->id}/convert-to-set", [
            'category_id' => $equipSet->id,
            'name'        => '変換セット',
            'pieces'      => [
                ['id' => $piece->id, 'category_id' => $cats['sword']->id, 'name' => '変換元の剣'],
                ['id' => $victim->id, 'category_id' => $cats['sword']->id, 'name' => '乗っ取り部位'],
            ],
        ]);

        $res->assertStatus(201);
        $setId = $res->json('id');
        // 変換元は採用されるが、無関係アイテムは新規部位として複製され元アイテムは書き換えられない
        $this->assertDatabaseHas('equipment_set_members', ['set_item_id' => $setId, 'piece_item_id' => $piece->id]);
        $victim->refresh();
        $this->assertSame('無関係の剣', $victim->name);
        $this->assertDatabaseMissing('equipment_set_members', ['set_item_id' => $setId, 'piece_item_id' => $victim->id]);
    }

    public function test_既に装備セットのアイテムは変換できない(): void
    {
        $admin    = $this->makeUserWithRole('admin');
        $equipSet = ItemCategory::create(['name' => '装備セット', 'sort_order' => 9]);
        $set = $this->makeItem(['name' => '既存セット', 'category_id' => $equipSet->id, 'is_equipment_set' => true, 'base_stats' => []]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/items/{$set->id}/convert-to-set", [
                'category_id' => $equipSet->id,
                'name'        => '別セット',
                'pieces'      => [['id' => $set->id, 'category_id' => $equipSet->id, 'name' => '別セット部位']],
            ])
            ->assertStatus(422);
    }

    public function test_未開封ペットはペット名を保存できる(): void
    {
        $user   = $this->makeUser();
        $other  = ItemCategory::create(['name' => 'その他', 'sort_order' => 9]);
        $pet    = ItemCategory::create(['name' => '未開封ペット', 'parent_id' => $other->id, 'sort_order' => 0]);

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/items', [
            'category_id' => $pet->id,
            'name'        => '未開封のもこもこ羊',
            'pet_name'    => 'もこもこ羊',
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('pet_name', 'もこもこ羊');
        $this->assertDatabaseHas('items', ['name' => '未開封のもこもこ羊', 'pet_name' => 'もこもこ羊']);
    }

    public function test_レシピはレシピ名とバインダーを保存しバインダー候補が自動追加される(): void
    {
        $user   = $this->makeUser();
        $other  = ItemCategory::create(['name' => 'その他', 'sort_order' => 9]);
        $recipe = ItemCategory::create(['name' => 'レシピ', 'parent_id' => $other->id, 'sort_order' => 1]);

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/items', [
            'category_id'   => $recipe->id,
            'name'          => '上級ポーションのレシピ',
            'recipe_name'   => '上級ポーション',
            'recipe_binder' => '薬調合',
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('recipe_name', '上級ポーション')
            ->assertJsonPath('recipe_binder', '薬調合');
        // バインダー名は候補テーブル（binder_labels）に自動追加される
        $this->assertDatabaseHas('binder_labels', ['label' => '薬調合']);

        // 同じバインダー名で別レシピを登録しても候補は重複しない
        $this->actingAs($user, 'sanctum')->postJson('/api/items', [
            'category_id'   => $recipe->id,
            'name'          => '中級ポーションのレシピ',
            'recipe_binder' => '薬調合',
        ])->assertStatus(201);
        $this->assertSame(1, \App\Models\BinderLabel::where('label', '薬調合')->count());
    }

    public function test_レシピは必要スキル値を保存できる(): void
    {
        $user   = $this->makeUser();
        $other  = ItemCategory::create(['name' => 'その他', 'sort_order' => 9]);
        $recipe = ItemCategory::create(['name' => 'レシピ', 'parent_id' => $other->id, 'sort_order' => 1]);

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/items', [
            'category_id'        => $recipe->id,
            'name'               => '上級ポーションのレシピ',
            'recipe_name'        => '上級ポーション',
            'skill_requirements' => ['薬調合' => 70, '料理' => 30],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('recipe_name', '上級ポーション');
        $this->assertSame(
            ['薬調合' => 70, '料理' => 30],
            Item::find($res->json('id'))->skill_requirements
        );
    }

    public function test_バインダー候補一覧は公開取得できる(): void
    {
        \App\Models\BinderLabel::create(['label' => '料理', 'sort_order' => 0]);
        \App\Models\BinderLabel::create(['label' => '鍛冶', 'sort_order' => 1]);

        $this->getJson('/api/binder-labels')
            ->assertOk()
            ->assertExactJson(['料理', '鍛冶']);
    }

    public function test_バインダー候補の管理はeditor以上のみ(): void
    {
        $user   = $this->makeUser();
        $editor = $this->makeUserWithRole('editor');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/admin/binder-labels', ['label' => '木工'])
            ->assertStatus(403);

        $this->actingAs($editor, 'sanctum')
            ->postJson('/api/admin/binder-labels', ['label' => '木工'])
            ->assertStatus(201);
        $this->assertDatabaseHas('binder_labels', ['label' => '木工']);
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
