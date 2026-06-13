<?php

namespace Tests\Feature;

use App\Models\ExcludedItem;
use App\Models\UserExcludedItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExcludedItemApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_共通除外アイテム名は未ログインでも取得できる(): void
    {
        ExcludedItem::create(['name' => 'ゴミ']);
        ExcludedItem::create(['name' => '木の枝']);

        $this->getJson('/api/excluded-items')->assertOk()
            ->assertJson(['ゴミ', '木の枝']);
    }

    public function test_adminは除外アイテムをまとめて登録でき重複は無視される(): void
    {
        $admin = $this->makeUserWithRole('admin');
        ExcludedItem::create(['name' => '木の枝']);

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/excluded-items', [
            'names' => ['ゴミ', '木の枝', 'ゴミ', '  小石  '],
        ])->assertCreated();

        // 新規 = ゴミ・小石（木の枝は既存・ゴミの重複は1件に集約）
        $res->assertJsonPath('created_count', 2);
        $this->assertDatabaseHas('excluded_items', ['name' => 'ゴミ']);
        $this->assertDatabaseHas('excluded_items', ['name' => '小石']);
        $this->assertSame(3, ExcludedItem::count());
    }

    public function test_一般ユーザーと編集者は除外アイテムを登録できない(): void
    {
        // 未ログインは 401（actingAs はテスト内で持続するため最初に検証する）
        $this->postJson('/api/admin/excluded-items', ['names' => ['x']])->assertUnauthorized();

        $user   = $this->makeUser();
        $editor = $this->makeUserWithRole('editor');

        $this->actingAs($user, 'sanctum')->postJson('/api/admin/excluded-items', ['names' => ['x']])->assertForbidden();
        $this->actingAs($editor, 'sanctum')->postJson('/api/admin/excluded-items', ['names' => ['x']])->assertForbidden();
    }

    public function test_adminはユーザー個別除外を集計して共通除外への候補を取得できる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $u1 = $this->makeUser();
        $u2 = $this->makeUser();
        $u3 = $this->makeUser();

        // 「ゴミ」は3人、「小石」は1人が個別除外
        foreach ([$u1, $u2, $u3] as $u) {
            UserExcludedItem::create(['user_id' => $u->id, 'name' => 'ゴミ']);
        }
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => '小石']);
        // 「木の枝」は既に共通除外 → 候補から除外される
        ExcludedItem::create(['name' => '木の枝']);
        UserExcludedItem::create(['user_id' => $u2->id, 'name' => '木の枝']);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/excluded-items/user-suggestions')
            ->assertOk();

        // user_count 降順。共通除外済みの「木の枝」は含まれない
        $res->assertJsonCount(2)
            ->assertJsonPath('0.name', 'ゴミ')
            ->assertJsonPath('0.user_count', 3)
            ->assertJsonPath('1.name', '小石')
            ->assertJsonPath('1.user_count', 1);

        $names = collect($res->json())->pluck('name');
        $this->assertFalse($names->contains('木の枝'));
    }

    public function test_ユーザー個別除外の集計はadminのみ取得できる(): void
    {
        $this->getJson('/api/admin/excluded-items/user-suggestions')->assertUnauthorized();
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->getJson('/api/admin/excluded-items/user-suggestions')->assertForbidden();
    }

    public function test_adminは除外アイテムを一括削除できる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $a = ExcludedItem::create(['name' => 'ゴミ']);
        $b = ExcludedItem::create(['name' => '木の枝']);
        $c = ExcludedItem::create(['name' => '小石']);

        $res = $this->actingAs($admin, 'sanctum')
            ->deleteJson('/api/admin/excluded-items', ['ids' => [$a->id, $b->id]])
            ->assertOk();
        $res->assertJsonPath('deleted_count', 2);

        $this->assertDatabaseMissing('excluded_items', ['id' => $a->id]);
        $this->assertDatabaseMissing('excluded_items', ['id' => $b->id]);
        $this->assertDatabaseHas('excluded_items', ['id' => $c->id]);
    }

    public function test_一括削除はadminのみ_idsは必須(): void
    {
        $this->deleteJson('/api/admin/excluded-items', ['ids' => [1]])->assertUnauthorized();
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->deleteJson('/api/admin/excluded-items', ['ids' => [1]])->assertForbidden();
        $this->actingAs($this->makeUserWithRole('admin'), 'sanctum')
            ->deleteJson('/api/admin/excluded-items', [])->assertStatus(422)->assertJsonValidationErrors('ids');
    }

    public function test_adminは除外アイテムを更新削除できる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $row = ExcludedItem::create(['name' => 'ゴミ']);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/excluded-items/{$row->id}", ['name' => '不要品'])
            ->assertOk()->assertJsonPath('name', '不要品');

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/admin/excluded-items/{$row->id}")
            ->assertNoContent();
        $this->assertDatabaseMissing('excluded_items', ['id' => $row->id]);
    }
}
