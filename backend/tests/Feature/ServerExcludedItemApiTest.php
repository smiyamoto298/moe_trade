<?php

namespace Tests\Feature;

use App\Models\ServerExcludedItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ServerExcludedItemApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_システム共通の対象外名は未ログインでも取得できる(): void
    {
        ServerExcludedItem::create(['name' => '日記']);
        ServerExcludedItem::create(['name' => '秘密のメモ']);

        $res = $this->getJson('/api/server-excluded-items')->assertOk();

        // 名前の配列（name 昇順）で返る
        $names = collect($res->json());
        $this->assertTrue($names->contains('日記'));
        $this->assertTrue($names->contains('秘密のメモ'));
    }

    public function test_adminは対象外アイテムをまとめて登録でき重複は無視される(): void
    {
        $admin = $this->makeUserWithRole('admin');
        ServerExcludedItem::create(['name' => '日記']);

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/server-excluded-items', [
            'names' => ['日記', '秘密のメモ', '秘密のメモ', '  覚書  '],
        ])->assertCreated();

        // 新規 = 秘密のメモ・覚書（日記は既存）
        $res->assertJsonPath('created_count', 2);
        $this->assertDatabaseHas('server_excluded_items', ['name' => '秘密のメモ']);
        $this->assertDatabaseHas('server_excluded_items', ['name' => '覚書']);
        // 既定シードを除いたテスト追加分（日記＋秘密のメモ＋覚書）で3件
        $this->assertSame(3, ServerExcludedItem::whereIn('name', ['日記', '秘密のメモ', '覚書'])->count());
    }

    public function test_既定でエンシェントコインがサーバ登録対象外に登録されている(): void
    {
        // マイグレーションのシードで投入される（公開エンドポイントにも出る）
        $this->assertDatabaseHas('server_excluded_items', ['name' => 'エンシェント コイン']);
        $names = collect($this->getJson('/api/server-excluded-items')->assertOk()->json());
        $this->assertTrue($names->contains('エンシェント コイン'));
    }

    public function test_adminは対象外アイテムを個別削除と一括削除できる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $a = ServerExcludedItem::create(['name' => '日記']);
        $b = ServerExcludedItem::create(['name' => '秘密のメモ']);
        $c = ServerExcludedItem::create(['name' => '覚書']);

        // 一括削除
        $this->actingAs($admin, 'sanctum')
            ->deleteJson('/api/admin/server-excluded-items', ['ids' => [$a->id, $b->id]])
            ->assertOk()->assertJsonPath('deleted_count', 2);
        $this->assertDatabaseMissing('server_excluded_items', ['id' => $a->id]);

        // 個別削除
        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/admin/server-excluded-items/{$c->id}")
            ->assertNoContent();
        $this->assertDatabaseMissing('server_excluded_items', ['id' => $c->id]);
    }

    public function test_一般ユーザーと編集者は対象外アイテムを管理できない(): void
    {
        $this->postJson('/api/admin/server-excluded-items', ['names' => ['x']])->assertUnauthorized();

        $user   = $this->makeUser();
        $editor = $this->makeUserWithRole('editor');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/admin/server-excluded-items', ['names' => ['x']])->assertForbidden();
        $this->actingAs($editor, 'sanctum')
            ->postJson('/api/admin/server-excluded-items', ['names' => ['x']])->assertForbidden();
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/admin/server-excluded-items')->assertForbidden();
    }

    public function test_登録はnamesが必須(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/server-excluded-items', [])
            ->assertStatus(422)->assertJsonValidationErrors('names');
    }
}
