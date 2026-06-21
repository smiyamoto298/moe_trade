<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_新規取引希望が来ると出品者に未読が付く(): void
    {
        $seller  = $this->makeUser();
        $buyer   = $this->makeUser();
        $listing = $this->makeListing($seller);

        // 取引希望（メッセージなし）→ チャット作成自体が出品者への通知になる
        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(201);

        // 出品者には未読1件
        $res = $this->actingAs($seller, 'sanctum')->getJson('/api/notifications/summary');
        $res->assertOk();
        $this->assertCount(1, $res->json('unread_chats'));
        $this->assertSame($listing->id, $res->json('unread_chats.0.listing_id'));

        // 取引希望者本人には未読なし
        $res = $this->actingAs($buyer, 'sanctum')->getJson('/api/notifications/summary');
        $this->assertCount(0, $res->json('unread_chats'));
    }

    public function test_最後の発言者の相手にだけ未読が付く(): void
    {
        $seller  = $this->makeUser();
        $buyer   = $this->makeUser();
        $listing = $this->makeListing($seller);

        $chatId = $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->json('id');

        // 出品者が返信 → 未読は買い手側に移る
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chatId}/messages", ['message' => 'こんにちは'])
            ->assertStatus(201);

        $this->assertCount(
            0,
            $this->actingAs($seller, 'sanctum')->getJson('/api/notifications/summary')->json('unread_chats')
        );
        $buyerRes = $this->actingAs($buyer, 'sanctum')->getJson('/api/notifications/summary');
        $this->assertCount(1, $buyerRes->json('unread_chats'));
        $this->assertSame('こんにちは', $buyerRes->json('unread_chats.0.last_message'));
    }

    public function test_掲示板の新着は対象ユーザーにのみ通知される(): void
    {
        $owner = $this->makeUser();
        $other = $this->makeUser();
        $admin = $this->makeUserWithRole('admin');

        // スレッド作成（最初の投稿は owner 本人）
        $threadId = $this->actingAs($owner, 'sanctum')
            ->postJson('/api/board/threads', ['title' => '問い合わせ', 'message' => '本文'])
            ->json('id');

        // admin には新着あり（他人の投稿）、無関係ユーザーには無し、本人にも無し（自分の投稿のため）
        $this->assertNotNull(
            $this->actingAs($admin, 'sanctum')->getJson('/api/notifications/summary')->json('board')
        );
        $this->assertNull(
            $this->actingAs($other, 'sanctum')->getJson('/api/notifications/summary')->json('board')
        );
        $this->assertNull(
            $this->actingAs($owner, 'sanctum')->getJson('/api/notifications/summary')->json('board')
        );

        // admin が返信 → スレッド作成者に新着が付く
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/board/threads/{$threadId}/posts", ['message' => '対応します'])
            ->assertStatus(201);

        $ownerRes = $this->actingAs($owner, 'sanctum')->getJson('/api/notifications/summary');
        $this->assertNotNull($ownerRes->json('board'));
        $this->assertSame('問い合わせ', $ownerRes->json('board.thread_title'));
    }

    public function test_掲示板はコメントしたスレッドの新着が通知される(): void
    {
        $owner     = $this->makeUser();
        $commenter = $this->makeUser();
        $third     = $this->makeUser();
        $stranger  = $this->makeUser();

        $threadId = $this->actingAs($owner, 'sanctum')
            ->postJson('/api/board/threads', ['title' => '相談', 'message' => '本文'])
            ->json('id');

        // commenter がコメント（このスレッドの当事者になる）
        $this->actingAs($commenter, 'sanctum')
            ->postJson("/api/board/threads/{$threadId}/posts", ['message' => '私も気になります'])
            ->assertStatus(201);

        // third が新たに投稿
        $this->actingAs($third, 'sanctum')
            ->postJson("/api/board/threads/{$threadId}/posts", ['message' => '追記です'])
            ->assertStatus(201);

        // コメント済みの commenter には新着が付く（他人の投稿）
        $this->assertNotNull(
            $this->actingAs($commenter, 'sanctum')->getJson('/api/notifications/summary')->json('board')
        );
        // スレッドに一切関与していない stranger には付かない
        $this->assertNull(
            $this->actingAs($stranger, 'sanctum')->getJson('/api/notifications/summary')->json('board')
        );
    }

    public function test_未整理の項目名件数はeditor_adminにのみ返る(): void
    {
        // 未整理 (is_organized=false) を2件、整理済みを1件用意
        \App\Models\BonusValueLabel::create(['label' => '攻撃力', 'is_organized' => false, 'sort_order' => 0]);
        \App\Models\BonusValueLabel::create(['label' => '防御力', 'is_organized' => false, 'sort_order' => 0]);
        \App\Models\BonusValueLabel::create(['label' => '命中', 'is_organized' => true, 'sort_order' => 1]);

        $editor = $this->makeUserWithRole('editor');
        $this->assertSame(
            2,
            $this->actingAs($editor, 'sanctum')->getJson('/api/notifications/summary')->json('unorganized_label_count')
        );

        // 一般ユーザーには 0（露出させない）
        $user = $this->makeUser();
        $this->assertSame(
            0,
            $this->actingAs($user, 'sanctum')->getJson('/api/notifications/summary')->json('unorganized_label_count')
        );
    }

    public function test_ユーザー個別除外の昇格候補件数はadminにのみ返る(): void
    {
        $u1 = $this->makeUser();
        $u2 = $this->makeUser();
        // DB保存の個別除外（同名は1件として数える）
        \App\Models\UserExcludedItem::create(['user_id' => $u1->id, 'name' => 'ゴミ']);
        \App\Models\UserExcludedItem::create(['user_id' => $u2->id, 'name' => 'ゴミ']);
        \App\Models\UserExcludedItem::create(['user_id' => $u1->id, 'name' => '木の枝']);
        // 端末報告（別名は加算、共通除外済みは除外）
        \App\Models\ReportedExcludedName::create(['name' => '石ころ']);
        \App\Models\ReportedExcludedName::create(['name' => '木の枝']); // DB分と同名→重複は1件
        // 共通除外済みは候補に出さない
        \App\Models\ExcludedItem::create(['name' => 'ゴミ']);

        // 残る候補: 木の枝・石ころ の2件
        $admin = $this->makeUserWithRole('admin');
        $this->assertSame(
            2,
            $this->actingAs($admin, 'sanctum')->getJson('/api/notifications/summary')->json('excluded_suggestion_count')
        );

        // editor / 一般には 0（admin 専用機能のため露出させない）
        $editor = $this->makeUserWithRole('editor');
        $this->assertSame(
            0,
            $this->actingAs($editor, 'sanctum')->getJson('/api/notifications/summary')->json('excluded_suggestion_count')
        );
    }

    public function test_自分の期限切れ出品買取がexpired_countに数えられる(): void
    {
        $owner = $this->makeUser();
        $other = $this->makeUser();

        // status=expired（バッチ確定済み）
        $this->makeListing($owner, null, ['status' => 'expired', 'expires_at' => now()->subDay()]);
        // active のまま期限超過（バッチ未確定）も数える
        $this->makeListing($owner, null, ['status' => 'active', 'expires_at' => now()->subHour()]);
        // 有効な出品は数えない
        $this->makeListing($owner, null, ['status' => 'active', 'expires_at' => now()->addDay()]);
        // 期限切れの買取
        \App\Models\BuyRequest::create([
            'user_id' => $owner->id, 'item_id' => $this->makeItem()->id,
            'price' => 500, 'currency' => 'AC', 'quantity' => 1, 'trade_type' => 'fixed',
            'status' => 'expired', 'expires_at' => now()->subDay(),
        ]);
        // 他人の期限切れは自分の件数に含めない
        $this->makeListing($other, null, ['status' => 'expired', 'expires_at' => now()->subDay()]);

        // owner: 出品2 + 買取1 = 3
        $this->assertSame(
            3,
            $this->actingAs($owner, 'sanctum')->getJson('/api/notifications/summary')->json('expired_count')
        );
        // other: 自分の期限切れ出品1件のみ
        $this->assertSame(
            1,
            $this->actingAs($other, 'sanctum')->getJson('/api/notifications/summary')->json('expired_count')
        );
    }

    /**
     * テクニック/アセット/その他のトップカテゴリを取得する。
     * アセット・その他はマイグレーションでseed済み、テクニックは makeCategoryTree で作る。
     */
    private function topCategory(string $name): \App\Models\ItemCategory
    {
        return \App\Models\ItemCategory::whereNull('parent_id')->where('name', $name)->firstOrFail();
    }

    public function test_未確認アイテム件数はカテゴリ別に分かれeditor_adminにのみ返る(): void
    {
        // 武器>刀剣・テクニック>ノアピース を作成（アセット・その他はマイグレーションでseed済み）
        $cats   = $this->makeCategoryTree();
        $weapon = $cats['sword'];          // 装備品（武器>刀剣）
        $noah   = $cats['noah'];           // テクニック>ノアピース
        $asset  = $this->topCategory('アセット');
        $other  = $this->topCategory('その他');

        // 装備品: 確認中2件・確認済み1件（確認済みは数えない）
        $this->makeItem(['category_id' => $weapon->id, 'verified_status' => 'unverified']);
        $this->makeItem(['category_id' => $weapon->id, 'verified_status' => 'unverified']);
        $this->makeItem(['category_id' => $weapon->id, 'verified_status' => 'verified']);
        // テクニック: 確認中1件 / アセット: 確認中1件 / その他: 確認中1件
        $this->makeItem(['category_id' => $noah->id, 'verified_status' => 'unverified']);
        $this->makeItem(['category_id' => $asset->id, 'verified_status' => 'unverified']);
        $this->makeItem(['category_id' => $other->id, 'verified_status' => 'unverified']);

        $editor = $this->makeUserWithRole('editor');
        $res = $this->actingAs($editor, 'sanctum')->getJson('/api/notifications/summary');
        $this->assertSame(2, $res->json('unverified_items.equipment'));
        $this->assertSame(1, $res->json('unverified_items.technique'));
        $this->assertSame(1, $res->json('unverified_items.asset'));
        $this->assertSame(1, $res->json('unverified_items.other'));
        $this->assertSame(5, $res->json('unverified_items.total'));

        // 一般ユーザーには露出させない
        $this->assertNull(
            $this->actingAs($this->makeUser(), 'sanctum')->getJson('/api/notifications/summary')->json('unverified_items')
        );
    }

    public function test_装備品の未確認件数は装備セットの構成部位を除外する(): void
    {
        $cats   = $this->makeCategoryTree();
        $weapon = $cats['sword'];
        $setCat = $this->topCategory('装備セット');   // マイグレーションでseed済み

        // セット本体（確認中）と、その構成部位2件（確認中）。本体だけを数え、構成部位は除外する。
        $set    = $this->makeItem(['category_id' => $setCat->id, 'verified_status' => 'unverified', 'is_equipment_set' => true]);
        $piece1 = $this->makeItem(['category_id' => $weapon->id, 'verified_status' => 'unverified']);
        $piece2 = $this->makeItem(['category_id' => $weapon->id, 'verified_status' => 'unverified']);
        $set->setMembers()->attach([$piece1->id => ['sort_order' => 0], $piece2->id => ['sort_order' => 1]]);

        // セットに属さない通常の確認中装備品は数える
        $this->makeItem(['category_id' => $weapon->id, 'verified_status' => 'unverified']);

        // 期待値: セット本体1 + 通常装備品1 = 2（構成部位の piece1/piece2 は除外）
        $editor = $this->makeUserWithRole('editor');
        $res = $this->actingAs($editor, 'sanctum')->getJson('/api/notifications/summary');
        $this->assertSame(2, $res->json('unverified_items.equipment'));
        $this->assertSame(2, $res->json('unverified_items.total'));
    }

    public function test_未ログインではアクセスできない(): void
    {
        $this->getJson('/api/notifications/summary')->assertStatus(401);
    }
}
