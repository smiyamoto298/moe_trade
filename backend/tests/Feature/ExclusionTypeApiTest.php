<?php

namespace Tests\Feature;

use App\Models\ExcludedItem;
use App\Models\ExclusionType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExclusionTypeApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_既定種別その他がマイグレーションで投入される(): void
    {
        $default = ExclusionType::default();
        $this->assertNotNull($default);
        $this->assertSame('その他', $default->name);
        $this->assertTrue($default->is_default);
    }

    public function test_adminは種別を追加改名できる(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/exclusion-types', ['name' => 'イベント'])
            ->assertCreated();
        $id = $res->json('id');
        $this->assertDatabaseHas('exclusion_types', ['name' => 'イベント', 'is_default' => false]);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/exclusion-types/{$id}", ['name' => 'イベント限定'])
            ->assertOk()->assertJsonPath('name', 'イベント限定');
    }

    public function test_種別追加時のdefault_enabledは省略時ONで指定もできる(): void
    {
        $admin = $this->makeUserWithRole('admin');

        // 省略時は既定ON（true）
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/exclusion-types', ['name' => 'イベント'])
            ->assertCreated()->assertJsonPath('default_enabled', true);

        // 明示的に OFF を指定できる
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/exclusion-types', ['name' => 'レア', 'default_enabled' => false])
            ->assertCreated()->assertJsonPath('default_enabled', false);
        $this->assertDatabaseHas('exclusion_types', ['name' => 'レア', 'default_enabled' => false]);
    }

    public function test_adminは種別のdefault_enabledを切り替えられる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $event = ExclusionType::create(['name' => 'イベント', 'default_enabled' => true]);

        // 改名せず default_enabled だけ更新できる（部分更新）
        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/exclusion-types/{$event->id}", ['default_enabled' => false])
            ->assertOk()
            ->assertJsonPath('default_enabled', false)
            ->assertJsonPath('name', 'イベント');
        $this->assertDatabaseHas('exclusion_types', ['id' => $event->id, 'default_enabled' => false]);
    }

    public function test_公開APIの種別はdefault_enabledを含む(): void
    {
        ExclusionType::create(['name' => 'レア', 'default_enabled' => false]);

        $res = $this->getJson('/api/excluded-items')->assertOk();
        $rare = collect($res->json('types'))->firstWhere('name', 'レア');
        $this->assertNotNull($rare);
        $this->assertFalse($rare['default_enabled']);
    }

    public function test_種別の追加改名はadminのみでnameは必須かつ一意(): void
    {
        // 未ログインは401・編集者は403
        $this->postJson('/api/admin/exclusion-types', ['name' => 'x'])->assertUnauthorized();
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->postJson('/api/admin/exclusion-types', ['name' => 'x'])->assertForbidden();

        $admin = $this->makeUserWithRole('admin');
        // name 必須
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/exclusion-types', [])
            ->assertStatus(422)->assertJsonValidationErrors('name');
        // 一意（既定「その他」と重複）
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/exclusion-types', ['name' => 'その他'])
            ->assertStatus(422)->assertJsonValidationErrors('name');
    }

    public function test_既定種別は削除できない(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $default = ExclusionType::default();

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/admin/exclusion-types/{$default->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('exclusion_types', ['id' => $default->id]);
    }

    public function test_種別を削除すると属する除外アイテムは既定種別へ付け替わる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $default = ExclusionType::default();
        $event = ExclusionType::create(['name' => 'イベント']);

        $item = ExcludedItem::create(['name' => '花火', 'exclusion_type_id' => $event->id]);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/admin/exclusion-types/{$event->id}")
            ->assertNoContent();

        // 種別は削除され、除外アイテムは残って既定種別へ移動している
        $this->assertDatabaseMissing('exclusion_types', ['id' => $event->id]);
        $this->assertDatabaseHas('excluded_items', ['id' => $item->id, 'exclusion_type_id' => $default->id]);
    }

    public function test_種別の削除はadminのみ(): void
    {
        $event = ExclusionType::create(['name' => 'イベント']);

        $this->deleteJson("/api/admin/exclusion-types/{$event->id}")->assertUnauthorized();
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->deleteJson("/api/admin/exclusion-types/{$event->id}")->assertForbidden();
    }
}
