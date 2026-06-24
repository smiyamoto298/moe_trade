<?php

namespace Tests\Feature;

use App\Models\ExcludedItem;
use App\Models\ReportedExcludedName;
use App\Models\UserExcludedItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExcludedItemApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_共通除外アイテムと種別は未ログインでも取得できる(): void
    {
        $default = \App\Models\ExclusionType::default();
        $event = \App\Models\ExclusionType::create(['name' => 'イベント', 'sort_order' => 1]);

        ExcludedItem::create(['name' => 'ゴミ', 'exclusion_type_id' => $default->id]);
        ExcludedItem::create(['name' => '木の枝', 'exclusion_type_id' => $event->id]);

        $res = $this->getJson('/api/excluded-items')->assertOk();

        // 種別一覧（既定の「その他」＋「イベント」）と、各アイテムの種別ID付き
        $res->assertJsonPath('items.0.name', 'ゴミ')
            ->assertJsonPath('items.0.type_id', $default->id)
            ->assertJsonPath('items.1.name', '木の枝')
            ->assertJsonPath('items.1.type_id', $event->id);

        $typeNames = collect($res->json('types'))->pluck('name');
        $this->assertTrue($typeNames->contains('その他'));
        $this->assertTrue($typeNames->contains('イベント'));
    }

    public function test_除外アイテムは種別を指定して登録でき省略時は既定種別になる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $default = \App\Models\ExclusionType::default();
        $event = \App\Models\ExclusionType::create(['name' => 'イベント']);

        // 種別を指定して登録
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/excluded-items', [
            'names' => ['花火'],
            'exclusion_type_id' => $event->id,
        ])->assertCreated();
        $this->assertDatabaseHas('excluded_items', ['name' => '花火', 'exclusion_type_id' => $event->id]);

        // 種別を省略 → 既定種別「その他」になる
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/excluded-items', [
            'names' => ['ゴミ'],
        ])->assertCreated();
        $this->assertDatabaseHas('excluded_items', ['name' => 'ゴミ', 'exclusion_type_id' => $default->id]);
    }

    public function test_adminは除外アイテムの種別を変更できる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $event = \App\Models\ExclusionType::create(['name' => 'イベント']);
        $row = ExcludedItem::create(['name' => 'ゴミ', 'exclusion_type_id' => \App\Models\ExclusionType::default()->id]);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/excluded-items/{$row->id}", ['exclusion_type_id' => $event->id])
            ->assertOk()->assertJsonPath('exclusion_type_id', $event->id);

        $this->assertDatabaseHas('excluded_items', ['id' => $row->id, 'exclusion_type_id' => $event->id]);
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

    public function test_共通種別へ昇格するとユーザー個別の種別割当は削除される(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $u1 = $this->makeUser();
        $u2 = $this->makeUser();

        // 2人が「ゴミ」を個別に分類済み
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => 'ゴミ']);
        UserExcludedItem::create(['user_id' => $u2->id, 'name' => 'ゴミ']);

        // 共通種別へ昇格
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/excluded-items', [
            'names' => ['ゴミ'],
        ])->assertCreated();

        // 共通に登録され、ユーザー個別の割当（重複）は削除される
        $this->assertDatabaseHas('excluded_items', ['name' => 'ゴミ']);
        $this->assertSame(0, UserExcludedItem::where('name', 'ゴミ')->count());
    }

    public function test_候補にはユーザーが最も多く割り当てた種別がsuggested_type_idとして付く(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $u1 = $this->makeUser();
        $u2 = $this->makeUser();
        $u3 = $this->makeUser();
        $event = \App\Models\ExclusionType::create(['name' => 'イベント']);
        $rare  = \App\Models\ExclusionType::create(['name' => 'レア']);

        // 「ゴミ」: 2人がイベント、1人がレア → イベントが最頻
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => 'ゴミ', 'exclusion_type_id' => $event->id]);
        UserExcludedItem::create(['user_id' => $u2->id, 'name' => 'ゴミ', 'exclusion_type_id' => $event->id]);
        UserExcludedItem::create(['user_id' => $u3->id, 'name' => 'ゴミ', 'exclusion_type_id' => $rare->id]);
        // 「小石」: 種別未指定（null）のみ → suggested_type_id は null
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => '小石']);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/excluded-items/user-suggestions')
            ->assertOk();

        $byName = collect($res->json())->keyBy('name');
        $this->assertSame($event->id, $byName['ゴミ']['suggested_type_id']);
        $this->assertNull($byName['小石']['suggested_type_id']);
    }

    public function test_候補にはユーザーが設定した種別の内訳が付く(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $u1 = $this->makeUser();
        $u2 = $this->makeUser();
        $u3 = $this->makeUser();
        $event = \App\Models\ExclusionType::create(['name' => 'イベント']);
        $rare  = \App\Models\ExclusionType::create(['name' => 'レア']);

        // 「ゴミ」: 2人がイベント、1人がレア → 内訳は多い順（イベント2・レア1）
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => 'ゴミ', 'exclusion_type_id' => $event->id]);
        UserExcludedItem::create(['user_id' => $u2->id, 'name' => 'ゴミ', 'exclusion_type_id' => $event->id]);
        UserExcludedItem::create(['user_id' => $u3->id, 'name' => 'ゴミ', 'exclusion_type_id' => $rare->id]);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/excluded-items/user-suggestions')->assertOk();

        $row = collect($res->json())->firstWhere('name', 'ゴミ');
        $this->assertNull($row['current_type_id']); // 共通未登録 → 新規候補
        $this->assertSame($event->id, $row['type_assignments'][0]['type_id']);
        $this->assertSame(2, $row['type_assignments'][0]['count']);
        $this->assertSame($rare->id, $row['type_assignments'][1]['type_id']);
        $this->assertSame(1, $row['type_assignments'][1]['count']);
    }

    public function test_共通登録済みでも別種別への上書きは上書き候補として返り同種別は出ない(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $u1 = $this->makeUser();
        $u2 = $this->makeUser();
        $event = \App\Models\ExclusionType::create(['name' => 'イベント']);
        $rare  = \App\Models\ExclusionType::create(['name' => 'レア']);

        // 「花火」は共通でイベント。u1 はレアへ上書き（別種別）、u2 はイベント（共通と同じ）
        ExcludedItem::create(['name' => '花火', 'exclusion_type_id' => $event->id]);
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => '花火', 'exclusion_type_id' => $rare->id]);
        UserExcludedItem::create(['user_id' => $u2->id, 'name' => '花火', 'exclusion_type_id' => $event->id]);
        // 「石」は共通でイベント、ユーザーもイベント（上書きなし）→ 候補に出ない
        ExcludedItem::create(['name' => '石', 'exclusion_type_id' => $event->id]);
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => '石', 'exclusion_type_id' => $event->id]);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/excluded-items/user-suggestions')->assertOk();

        $byName = collect($res->json())->keyBy('name');
        // 花火: 上書き候補（現在=イベント・候補=レア・人数は上書き者のみ=1）
        $this->assertTrue($byName->has('花火'));
        $this->assertSame($event->id, $byName['花火']['current_type_id']);
        $this->assertSame($rare->id, $byName['花火']['suggested_type_id']);
        $this->assertSame(1, $byName['花火']['user_count']);
        // 石: 上書きが無いので候補に出ない
        $this->assertFalse($byName->has('石'));
    }

    public function test_上書き候補を共通化すると共通種別が更新されユーザー割当は削除される(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $u1 = $this->makeUser();
        $event = \App\Models\ExclusionType::create(['name' => 'イベント']);
        $rare  = \App\Models\ExclusionType::create(['name' => 'レア']);
        $row = ExcludedItem::create(['name' => '花火', 'exclusion_type_id' => $event->id]);
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => '花火', 'exclusion_type_id' => $rare->id]);

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/excluded-items', [
            'names'             => ['花火'],
            'exclusion_type_id' => $rare->id,
            'update_existing'   => true,
        ])->assertCreated();
        $res->assertJsonPath('updated_count', 1)->assertJsonPath('created_count', 0);

        // 共通種別がレアへ更新され、ユーザー個別割当は削除される
        $this->assertDatabaseHas('excluded_items', ['id' => $row->id, 'exclusion_type_id' => $rare->id]);
        $this->assertSame(0, UserExcludedItem::where('name', '花火')->count());
    }

    public function test_update_existing無しでは既存の共通種別は更新されない(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $event = \App\Models\ExclusionType::create(['name' => 'イベント']);
        $rare  = \App\Models\ExclusionType::create(['name' => 'レア']);
        $row = ExcludedItem::create(['name' => '花火', 'exclusion_type_id' => $event->id]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/excluded-items', [
            'names'             => ['花火'],
            'exclusion_type_id' => $rare->id,
        ])->assertCreated()->assertJsonPath('updated_count', 0);

        $this->assertDatabaseHas('excluded_items', ['id' => $row->id, 'exclusion_type_id' => $event->id]);
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

    public function test_端末保存ユーザーは除外名を匿名で報告でき重複は無視される(): void
    {
        $user = $this->makeUser();

        // ログインユーザーが names[] で報告（リクエスト内の重複・前後空白は整理）
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/excluded-items/report', ['names' => ['ゴミ', '木の枝', 'ゴミ', '  小石  ']])
            ->assertNoContent();

        $this->assertSame(3, ReportedExcludedName::count());
        $this->assertDatabaseHas('reported_excluded_names', ['name' => 'ゴミ']);
        $this->assertDatabaseHas('reported_excluded_names', ['name' => '小石']);
        // user_id 等は持たない（匿名・名前のみ）
        $this->assertSame(['name'], array_values(array_diff(
            array_keys(ReportedExcludedName::first()->getAttributes()),
            ['id', 'created_at', 'updated_at']
        )));

        // 既存の名前は firstOrCreate で黙って無視（件数は増えない）
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/excluded-items/report', ['names' => ['ゴミ']])
            ->assertNoContent();
        $this->assertSame(1, ReportedExcludedName::where('name', 'ゴミ')->count());
    }

    public function test_除外名の報告はログイン必須でnamesは必須(): void
    {
        $this->postJson('/api/excluded-items/report', ['names' => ['x']])->assertUnauthorized();

        $this->actingAs($this->makeUser(), 'sanctum')
            ->postJson('/api/excluded-items/report', [])
            ->assertStatus(422)->assertJsonValidationErrors('names');
    }

    public function test_userSuggestionsは端末報告分をfrom_deviceで合流する(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $u1 = $this->makeUser();

        // DB保存ユーザーは「ゴミ」を除外（人数集計対象）
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => 'ゴミ']);
        // 端末保存ユーザーの匿名報告: 「ゴミ」(DB分と重複) と「小石」(端末のみ)
        ReportedExcludedName::create(['name' => 'ゴミ']);
        ReportedExcludedName::create(['name' => '小石']);
        // 共通除外済み・却下済みの名前は報告があっても候補から除外される
        ExcludedItem::create(['name' => '木の枝']);
        ReportedExcludedName::create(['name' => '木の枝']);
        \App\Models\DismissedExcludedSuggestion::create(['name' => 'ボツ', 'dismissed_by' => $admin->id]);
        ReportedExcludedName::create(['name' => 'ボツ']);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/excluded-items/user-suggestions')
            ->assertOk();

        // user_count 降順 → 「ゴミ」(DB1人かつ端末) が先、「小石」(端末のみ・人数0) が後。木の枝・ボツは出ない
        $res->assertJsonCount(2)
            ->assertJsonPath('0.name', 'ゴミ')
            ->assertJsonPath('0.user_count', 1)
            ->assertJsonPath('0.from_device', true)
            ->assertJsonPath('1.name', '小石')
            ->assertJsonPath('1.user_count', 0)
            ->assertJsonPath('1.from_device', true);

        $names = collect($res->json())->pluck('name');
        $this->assertFalse($names->contains('木の枝'));
        $this->assertFalse($names->contains('ボツ'));
    }

    public function test_ユーザー個別除外の集計はadminのみ取得できる(): void
    {
        $this->getJson('/api/admin/excluded-items/user-suggestions')->assertUnauthorized();
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->getJson('/api/admin/excluded-items/user-suggestions')->assertForbidden();
    }

    public function test_adminは候補を共通にしないと却下でき以後候補に出ない(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $u1 = $this->makeUser();
        $u2 = $this->makeUser();

        UserExcludedItem::create(['user_id' => $u1->id, 'name' => 'ゴミ']);
        UserExcludedItem::create(['user_id' => $u2->id, 'name' => 'ゴミ']);
        UserExcludedItem::create(['user_id' => $u1->id, 'name' => '小石']);

        // 「ゴミ」を共通にしない（却下）
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/excluded-items/dismiss-suggestion', ['name' => '  ゴミ  '])
            ->assertNoContent();
        $this->assertDatabaseHas('dismissed_excluded_suggestions', ['name' => 'ゴミ', 'dismissed_by' => $admin->id]);

        // 候補からは「ゴミ」が消え、個別除外（user_excluded_items）自体は残る
        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/excluded-items/user-suggestions')->assertOk();
        $res->assertJsonCount(1)->assertJsonPath('0.name', '小石');
        $this->assertDatabaseHas('user_excluded_items', ['name' => 'ゴミ']);
    }

    public function test_候補の却下は重複しても204で冪等(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/excluded-items/dismiss-suggestion', ['name' => 'ゴミ'])->assertNoContent();
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/excluded-items/dismiss-suggestion', ['name' => 'ゴミ'])->assertNoContent();

        $this->assertSame(1, \App\Models\DismissedExcludedSuggestion::where('name', 'ゴミ')->count());
    }

    public function test_候補の却下はadminのみ_nameは必須(): void
    {
        $this->postJson('/api/admin/excluded-items/dismiss-suggestion', ['name' => 'x'])->assertUnauthorized();
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->postJson('/api/admin/excluded-items/dismiss-suggestion', ['name' => 'x'])->assertForbidden();
        $this->actingAs($this->makeUserWithRole('admin'), 'sanctum')
            ->postJson('/api/admin/excluded-items/dismiss-suggestion', [])
            ->assertStatus(422)->assertJsonValidationErrors('name');
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
