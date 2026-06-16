<?php

namespace Tests\Feature;

use App\Models\ItemHashtag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * アイテムのハッシュタグ機能。
 * - ユーザー追加タグは wiki 型（ログイン中の任意ユーザーが追加・削除可）
 * - 固定タグ（is_fixed）は admin/editor がアイテム編集で設定し、ユーザーは削除不可
 * - 一覧（アイテム/出品）はタグで絞り込める
 */
class ItemHashtagTest extends TestCase
{
    use RefreshDatabase;

    public function test_ログインユーザーはハッシュタグを追加できアイテム詳細に出る(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/items/{$item->id}/hashtags", ['tag' => '#おすすめ'])
            ->assertStatus(201)
            // 先頭の # は除去して保存される
            ->assertJsonPath('tag', 'おすすめ')
            ->assertJsonPath('is_fixed', false);

        $this->assertDatabaseHas('item_hashtags', [
            'item_id' => $item->id, 'tag' => 'おすすめ', 'is_fixed' => false, 'created_by' => $user->id,
        ]);

        // アイテム詳細にタグが含まれる
        $this->getJson("/api/items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('hashtags.0.tag', 'おすすめ');
    }

    public function test_未ログインではハッシュタグを追加できない(): void
    {
        $item = $this->makeItem();

        $this->postJson("/api/items/{$item->id}/hashtags", ['tag' => 'x'])
            ->assertStatus(401);
    }

    public function test_同じタグは大文字小文字を無視して重複登録されない(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/items/{$item->id}/hashtags", ['tag' => 'Rare'])
            ->assertStatus(201);

        // 大文字小文字違い・# 付きでも重複扱い（既存を返し新規作成しない）
        $this->actingAs($user, 'sanctum')
            ->postJson("/api/items/{$item->id}/hashtags", ['tag' => '#rare'])
            ->assertStatus(200);

        $this->assertSame(1, ItemHashtag::where('item_id', $item->id)->count());
    }

    public function test_空タグは422(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/items/{$item->id}/hashtags", ['tag' => '#  '])
            ->assertStatus(422);
    }

    public function test_ユーザー追加タグは他のログインユーザーでも削除できる_wiki型(): void
    {
        $author  = $this->makeUser();
        $another = $this->makeUser();
        $item    = $this->makeItem();

        $tag = $this->actingAs($author, 'sanctum')
            ->postJson("/api/items/{$item->id}/hashtags", ['tag' => '消せるタグ'])
            ->json('id');

        // 追加者でない別のユーザーでも削除できる
        $this->actingAs($another, 'sanctum')
            ->deleteJson("/api/items/{$item->id}/hashtags/{$tag}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('item_hashtags', ['id' => $tag]);
    }

    public function test_ユーザータグはテキスト入力で総入れ替えできる_wiki型(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();
        $item->hashtags()->create(['tag' => '古いタグ', 'is_fixed' => false]);

        $res = $this->actingAs($user, 'sanctum')
            ->putJson("/api/items/{$item->id}/hashtags", ['tags' => ['#和風', '＃袴', '和風']])
            ->assertOk();

        // 先頭の # 除去・重複排除（和風が重複）で2件
        $this->assertCount(2, $res->json());
        $this->assertDatabaseMissing('item_hashtags', ['item_id' => $item->id, 'tag' => '古いタグ']);
        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '和風', 'is_fixed' => false]);
        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '袴', 'is_fixed' => false]);
    }

    public function test_ユーザータグの総入れ替えは固定タグを消さず昇格もしない(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();
        $item->hashtags()->create(['tag' => '公式', 'is_fixed' => true]);

        // 入力に固定タグと同名「公式」を含めても、固定タグは固定のまま・重複も作らない
        $this->actingAs($user, 'sanctum')
            ->putJson("/api/items/{$item->id}/hashtags", ['tags' => ['公式', '新タグ']])
            ->assertOk();

        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '公式', 'is_fixed' => true]);
        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '新タグ', 'is_fixed' => false]);
        $this->assertSame(1, ItemHashtag::where('item_id', $item->id)->where('tag', '公式')->count());
    }

    public function test_未ログインではタグ総入れ替えできない(): void
    {
        $item = $this->makeItem();
        $this->putJson("/api/items/{$item->id}/hashtags", ['tags' => ['x']])->assertStatus(401);
    }

    public function test_空配列の総入れ替えでユーザータグを全削除できる(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();
        $item->hashtags()->create(['tag' => '消える', 'is_fixed' => false]);
        $item->hashtags()->create(['tag' => '固定', 'is_fixed' => true]);

        $this->actingAs($user, 'sanctum')
            ->putJson("/api/items/{$item->id}/hashtags", ['tags' => []])
            ->assertOk();

        // ユーザータグは消え、固定タグは残る
        $this->assertDatabaseMissing('item_hashtags', ['item_id' => $item->id, 'is_fixed' => false]);
        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '固定', 'is_fixed' => true]);
    }

    public function test_アイテム編集で通常タグと固定タグを同時に設定できる(): void
    {
        $editor = $this->makeUserWithRole('editor');
        $item   = $this->makeItem(['verified_status' => 'verified']);

        $this->actingAs($editor, 'sanctum')
            ->putJson("/api/items/{$item->id}", [
                'fixed_hashtags' => ['#公式'],
                'user_hashtags'  => ['#和風', '#袴'],
            ])
            ->assertOk();

        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '公式', 'is_fixed' => true]);
        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '和風', 'is_fixed' => false]);
        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '袴', 'is_fixed' => false]);
    }

    public function test_固定タグは一般ユーザーが削除できない(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem();
        $fixed = $item->hashtags()->create(['tag' => '公式', 'is_fixed' => true]);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/items/{$item->id}/hashtags/{$fixed->id}")
            ->assertStatus(403);

        $this->assertDatabaseHas('item_hashtags', ['id' => $fixed->id]);
    }

    public function test_editorとadminは固定タグも削除できる(): void
    {
        foreach (['editor', 'admin'] as $role) {
            $staff = $this->makeUserWithRole($role);
            $item  = $this->makeItem(['name' => "固定削除{$role}"]);
            $fixed = $item->hashtags()->create(['tag' => '公式', 'is_fixed' => true]);
            // ユーザー追加タグも当然削除できる（wiki型）
            $userTag = $item->hashtags()->create(['tag' => '通常', 'is_fixed' => false]);

            $this->actingAs($staff, 'sanctum')
                ->deleteJson("/api/items/{$item->id}/hashtags/{$fixed->id}")
                ->assertStatus(204);
            $this->actingAs($staff, 'sanctum')
                ->deleteJson("/api/items/{$item->id}/hashtags/{$userTag->id}")
                ->assertStatus(204);

            $this->assertDatabaseMissing('item_hashtags', ['id' => $fixed->id]);
            $this->assertDatabaseMissing('item_hashtags', ['id' => $userTag->id]);
        }
    }

    public function test_editorはアイテム編集で固定タグを設定できる(): void
    {
        $editor = $this->makeUserWithRole('editor');
        $item   = $this->makeItem(['verified_status' => 'verified']);

        $this->actingAs($editor, 'sanctum')
            ->putJson("/api/items/{$item->id}", ['fixed_hashtags' => ['公式', 'イベント', '公式']])
            ->assertOk();

        // 重複は排除され固定タグとして保存される
        $this->assertSame(2, ItemHashtag::where('item_id', $item->id)->where('is_fixed', true)->count());
        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '公式', 'is_fixed' => true]);
    }

    public function test_固定タグ設定はユーザー追加タグを消さず同名は固定へ昇格する(): void
    {
        $editor = $this->makeUserWithRole('editor');
        $user   = $this->makeUser();
        $item   = $this->makeItem(['verified_status' => 'verified']);

        // ユーザーが2つタグを追加
        $this->actingAs($user, 'sanctum')->postJson("/api/items/{$item->id}/hashtags", ['tag' => 'ユーザータグ']);
        $this->actingAs($user, 'sanctum')->postJson("/api/items/{$item->id}/hashtags", ['tag' => '公式']);

        // editor が固定タグ「公式」を設定
        $this->actingAs($editor, 'sanctum')
            ->putJson("/api/items/{$item->id}", ['fixed_hashtags' => ['公式']])
            ->assertOk();

        // ユーザータグは残り、同名「公式」は固定へ昇格（重複しない）
        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => 'ユーザータグ', 'is_fixed' => false]);
        $this->assertDatabaseHas('item_hashtags', ['item_id' => $item->id, 'tag' => '公式', 'is_fixed' => true]);
        $this->assertSame(1, ItemHashtag::where('item_id', $item->id)->where('tag', '公式')->count());
    }

    public function test_一般ユーザーの編集では固定タグは無視される(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem(['verified_status' => 'unverified', 'submitted_by' => $user->id]);

        $this->actingAs($user, 'sanctum')
            ->putJson("/api/items/{$item->id}", ['name' => '改名', 'fixed_hashtags' => ['不正な固定']])
            ->assertOk();

        // 一般ユーザーは固定タグを作成できない
        $this->assertDatabaseMissing('item_hashtags', ['item_id' => $item->id, 'is_fixed' => true]);
    }

    public function test_アイテム一覧はハッシュタグで絞り込める(): void
    {
        $matched = $this->makeItem(['name' => 'タグ付きの剣']);
        $other   = $this->makeItem(['name' => 'タグなしの剣']);
        $matched->hashtags()->create(['tag' => 'レア', 'is_fixed' => true]);

        $data = collect($this->getJson('/api/items?hashtag=レア')->assertOk()->json('data'));

        $this->assertTrue($data->contains('id', $matched->id));
        $this->assertFalse($data->contains('id', $other->id));
    }

    public function test_出品一覧はハッシュタグで絞り込める(): void
    {
        $taggedItem = $this->makeItem(['name' => 'タグ付き']);
        $taggedItem->hashtags()->create(['tag' => 'セール', 'is_fixed' => false]);
        $matchedListing = $this->makeListing(null, $taggedItem);

        $plainListing = $this->makeListing(); // タグなしの別アイテム

        $ids = collect($this->getJson('/api/listings?hashtag=セール')->assertOk()->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($matchedListing->id));
        $this->assertFalse($ids->contains($plainListing->id));
    }

    public function test_アイテム削除でハッシュタグも連鎖削除される(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $item  = $this->makeItem();
        $item->hashtags()->create(['tag' => '消える', 'is_fixed' => true]);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/items/{$item->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('item_hashtags', ['item_id' => $item->id]);
    }
}
