<?php

namespace Tests\Feature;

use App\Models\MoeAccount;
use App\Models\OwnedItem;
use App\Models\UserExcludedItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InventoryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_所持品スナップショットは未ログインでは取得保存できない(): void
    {
        $this->getJson('/api/mypage/inventory')->assertUnauthorized();
        $this->putJson('/api/mypage/inventory', ['accounts' => [], 'items' => [], 'exclusions' => []])
            ->assertUnauthorized();
        $this->putJson('/api/mypage/inventory/storage-mode', ['mode' => 'db'])->assertUnauthorized();
    }

    public function test_保存先モードの既定はlocalでスナップショットに含まれる(): void
    {
        $user = $this->makeUser();
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/mypage/inventory')
            ->assertOk()
            ->assertJsonPath('storage_mode', 'local');
    }

    public function test_保存先モードをサーバーに記憶でき他端末扱いの取得にも反映される(): void
    {
        $user = $this->makeUser();

        // db へ切り替え（端末A相当）
        $this->actingAs($user, 'sanctum')
            ->putJson('/api/mypage/inventory/storage-mode', ['mode' => 'db'])
            ->assertOk()
            ->assertJsonPath('storage_mode', 'db');

        $this->assertDatabaseHas('users', ['id' => $user->id, 'inventory_storage_mode' => 'db']);

        // 別端末でログインしても（localStorage 非依存で）db が返る
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/mypage/inventory')
            ->assertOk()
            ->assertJsonPath('storage_mode', 'db');

        // local へ戻すと反映される
        $this->actingAs($user, 'sanctum')
            ->putJson('/api/mypage/inventory/storage-mode', ['mode' => 'local'])
            ->assertOk()
            ->assertJsonPath('storage_mode', 'local');
        $this->assertDatabaseHas('users', ['id' => $user->id, 'inventory_storage_mode' => 'local']);
    }

    public function test_不正な保存先モードはバリデーションエラーになる(): void
    {
        $user = $this->makeUser();
        $this->actingAs($user, 'sanctum')
            ->putJson('/api/mypage/inventory/storage-mode', ['mode' => 'cloud'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('mode');
    }

    public function test_データ移行_既存のサーバーデータ保有ユーザーはdbに初期化される(): void
    {
        // 列追加時の既定 local に対し、既にサーバー保存済みのユーザーを db に引き上げる移行。
        $withItems = $this->makeUser();
        $withItems->update(['inventory_storage_mode' => 'local']);
        $acc = MoeAccount::create(['user_id' => $withItems->id, 'name' => 'メイン', 'sort_order' => 0]);
        OwnedItem::create(['user_id' => $withItems->id, 'moe_account_id' => $acc->id, 'name' => '剣', 'count' => 1]);

        $withExclusionsOnly = $this->makeUser();
        $withExclusionsOnly->update(['inventory_storage_mode' => 'local']);
        UserExcludedItem::create(['user_id' => $withExclusionsOnly->id, 'name' => 'ゴミ']);

        $withoutData = $this->makeUser();
        $withoutData->update(['inventory_storage_mode' => 'local']);

        // 一度適用済みのデータ移行を冪等に再実行して検証する
        $migration = require database_path('migrations/2026_06_13_000013_set_db_inventory_mode_for_existing_data.php');
        $migration->up();

        $this->assertSame('db', $withItems->fresh()->inventory_storage_mode);
        $this->assertSame('db', $withExclusionsOnly->fresh()->inventory_storage_mode);
        $this->assertSame('local', $withoutData->fresh()->inventory_storage_mode);
    }

    public function test_全置換で保存しスナップショットを取得できる_アカウント紐づけと登録アイテム同梱(): void
    {
        $user = $this->makeUser();
        $item = $this->makeItem(['name' => '炎の剣']);

        $payload = [
            'accounts' => [
                ['key' => 'a1', 'name' => 'メイン', 'sort_order' => 0],
                ['key' => 'a2', 'name' => 'サブ', 'sort_order' => 1],
            ],
            'items' => [
                // 登録アイテムに紐づく行（item を同梱して返す）
                ['account_key' => 'a1', 'item_id' => $item->id, 'name' => '炎の剣', 'category' => '武器', 'count' => 3, 'is_marked' => true, 'is_dyed' => true],
                // 未紐づけ行（item_id = null でも保存できる）
                ['account_key' => 'a2', 'item_id' => null, 'name' => '謎のアイテム', 'count' => 1],
            ],
            'exclusions' => ['ゴミ', '木の枝'],
        ];

        $res = $this->actingAs($user, 'sanctum')
            ->putJson('/api/mypage/inventory', $payload)
            ->assertOk();

        $res->assertJsonCount(2, 'accounts')
            ->assertJsonCount(2, 'items')
            // 文字列で送っても {name, exclusion_type_id} で返る（後方互換・NULL=既定種別）。name 昇順
            ->assertJsonPath('exclusions.0.name', 'ゴミ')
            ->assertJsonPath('exclusions.0.exclusion_type_id', null)
            ->assertJsonPath('exclusions.1.name', '木の枝')
            ->assertJsonPath('exclusions.1.exclusion_type_id', null);

        // 登録アイテム行に item オブジェクトが同梱される
        $items = collect($res->json('items'));
        $linked = $items->firstWhere('name', '炎の剣');
        $this->assertSame($item->id, $linked['item']['id']);
        $this->assertTrue($linked['is_marked']);
        $this->assertTrue($linked['is_dyed']);

        // 未紐づけ行は item が null
        $unlinked = $items->firstWhere('name', '謎のアイテム');
        $this->assertNull($unlinked['item']);

        // アカウントへ正しく紐づく
        $mainAccount = collect($res->json('accounts'))->firstWhere('name', 'メイン');
        $this->assertSame($mainAccount['id'], $linked['moe_account_id']);

        $this->assertSame(2, OwnedItem::where('user_id', $user->id)->count());
        $this->assertSame(2, UserExcludedItem::where('user_id', $user->id)->count());
    }

    public function test_種別割当をtype_id付きで保存しスナップショットに含まれる(): void
    {
        $user = $this->makeUser();
        $event = \App\Models\ExclusionType::create(['name' => 'イベント']);

        $res = $this->actingAs($user, 'sanctum')->putJson('/api/mypage/inventory', [
            'accounts'   => [],
            'items'      => [],
            // オブジェクト形式（種別ID付き）と文字列（NULL=既定種別）を混在で送る
            'exclusions' => [
                ['name' => '花火', 'exclusion_type_id' => $event->id],
                '木の枝',
            ],
        ])->assertOk();

        $this->assertDatabaseHas('user_excluded_items', [
            'user_id' => $user->id, 'name' => '花火', 'exclusion_type_id' => $event->id,
        ]);
        $this->assertDatabaseHas('user_excluded_items', [
            'user_id' => $user->id, 'name' => '木の枝', 'exclusion_type_id' => null,
        ]);

        $byName = collect($res->json('exclusions'))->keyBy('name');
        $this->assertSame($event->id, $byName['花火']['exclusion_type_id']);
        $this->assertNull($byName['木の枝']['exclusion_type_id']);
    }

    public function test_不正なtype_idはnullに丸められる(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user, 'sanctum')->putJson('/api/mypage/inventory', [
            'accounts'   => [],
            'items'      => [],
            'exclusions' => [['name' => 'なぞ', 'exclusion_type_id' => 99999]],
        ])->assertOk();

        $this->assertDatabaseHas('user_excluded_items', [
            'user_id' => $user->id, 'name' => 'なぞ', 'exclusion_type_id' => null,
        ]);
    }

    public function test_共通種別と同名でもユーザー種別割当はスナップショットに含まれる(): void
    {
        $user = $this->makeUser();
        // 共通種別（excluded_items）に「ゴミ」がある状態でユーザーも「ゴミ」に別種別を割当（上書き）
        $rare = \App\Models\ExclusionType::create(['name' => 'レア']);
        \App\Models\ExcludedItem::create(['name' => 'ゴミ']);

        $res = $this->actingAs($user, 'sanctum')->putJson('/api/mypage/inventory', [
            'accounts'   => [],
            'items'      => [],
            'exclusions' => [['name' => 'ゴミ', 'exclusion_type_id' => $rare->id], '木の枝'],
        ])->assertOk();

        // ユーザー割当は共通より優先（上書き可）のため、共通と同名でもスナップショットに含まれる
        $byName = collect($res->json('exclusions'))->keyBy('name');
        $this->assertTrue($byName->has('ゴミ'));
        $this->assertSame($rare->id, $byName['ゴミ']['exclusion_type_id']);
        $this->assertTrue($byName->has('木の枝'));
    }

    public function test_共通と同じ種別の個別割当は冗長なので保存されずスナップショットにも出ない(): void
    {
        $user = $this->makeUser();
        $rare  = \App\Models\ExclusionType::create(['name' => 'レア']);
        $event = \App\Models\ExclusionType::create(['name' => 'イベント']);
        // 共通: 「ゴミ」=レア
        \App\Models\ExcludedItem::create(['name' => 'ゴミ', 'exclusion_type_id' => $rare->id]);

        $res = $this->actingAs($user, 'sanctum')->putJson('/api/mypage/inventory', [
            'accounts'   => [],
            'items'      => [],
            // 「ゴミ」は共通と同じレア（冗長）、「花火」は共通に無いイベント
            'exclusions' => [
                ['name' => 'ゴミ',  'exclusion_type_id' => $rare->id],
                ['name' => '花火', 'exclusion_type_id' => $event->id],
            ],
        ])->assertOk();

        $names = collect($res->json('exclusions'))->pluck('name');
        $this->assertFalse($names->contains('ゴミ')); // 共通と同じ種別 → 該当設定は削除
        $this->assertTrue($names->contains('花火'));
        // 保存（永続化）もされない
        $this->assertSame(0, UserExcludedItem::where('user_id', $user->id)->where('name', 'ゴミ')->count());
        $this->assertDatabaseHas('user_excluded_items', ['user_id' => $user->id, 'name' => '花火', 'exclusion_type_id' => $event->id]);
    }

    public function test_既存の共通と同じ種別の個別割当はスナップショット取得時に除外される(): void
    {
        $user = $this->makeUser();
        $rare = \App\Models\ExclusionType::create(['name' => 'レア']);
        \App\Models\ExcludedItem::create(['name' => 'ゴミ', 'exclusion_type_id' => $rare->id]);
        // 旧データとして、共通と同じ種別の個別割当が DB に残っているケース
        UserExcludedItem::create(['user_id' => $user->id, 'name' => 'ゴミ', 'exclusion_type_id' => $rare->id]);

        $res = $this->actingAs($user, 'sanctum')->getJson('/api/mypage/inventory')->assertOk();
        $names = collect($res->json('exclusions'))->pluck('name');
        $this->assertFalse($names->contains('ゴミ'));
    }

    public function test_アイテムごとのメモを保存しスナップショットに含まれる(): void
    {
        $user = $this->makeUser();

        $res = $this->actingAs($user, 'sanctum')->putJson('/api/mypage/inventory', [
            'accounts'   => [['key' => 'a1', 'name' => 'メイン']],
            'items'      => [
                ['account_key' => 'a1', 'name' => '炎の剣', 'count' => 1, 'note' => '次回まとめて出品予定'],
                ['account_key' => 'a1', 'name' => 'メモ無し', 'count' => 1],
            ],
            'exclusions' => [],
        ])->assertOk();

        // 永続化される
        $this->assertDatabaseHas('owned_items', ['user_id' => $user->id, 'name' => '炎の剣', 'note' => '次回まとめて出品予定']);
        // 未入力は null
        $this->assertDatabaseHas('owned_items', ['user_id' => $user->id, 'name' => 'メモ無し', 'note' => null]);

        // スナップショットに note が含まれる（再読み込み後も残る）
        $items = collect($res->json('items'));
        $this->assertSame('次回まとめて出品予定', $items->firstWhere('name', '炎の剣')['note']);
        $this->assertNull($items->firstWhere('name', 'メモ無し')['note']);
    }

    public function test_メモが長すぎるとバリデーションエラーになる(): void
    {
        $user = $this->makeUser();
        $this->actingAs($user, 'sanctum')->putJson('/api/mypage/inventory', [
            'accounts'   => [],
            'items'      => [['name' => '剣', 'count' => 1, 'note' => str_repeat('あ', 501)]],
            'exclusions' => [],
        ])->assertStatus(422)->assertJsonValidationErrors('items.0.note');
    }

    public function test_全置換は既存を入れ替え他ユーザーのデータに影響しない(): void
    {
        $me    = $this->makeUser();
        $other = $this->makeUser();

        // 他ユーザーの既存データ
        $otherAcc = MoeAccount::create(['user_id' => $other->id, 'name' => '他人', 'sort_order' => 0]);
        OwnedItem::create(['user_id' => $other->id, 'moe_account_id' => $otherAcc->id, 'name' => '他人の剣', 'count' => 1]);

        // 自分の旧データ
        $myAcc = MoeAccount::create(['user_id' => $me->id, 'name' => '旧', 'sort_order' => 0]);
        OwnedItem::create(['user_id' => $me->id, 'moe_account_id' => $myAcc->id, 'name' => '旧アイテム', 'count' => 1]);

        $this->actingAs($me, 'sanctum')->putJson('/api/mypage/inventory', [
            'accounts'   => [['key' => 'n1', 'name' => '新']],
            'items'      => [['account_key' => 'n1', 'name' => '新アイテム', 'count' => 5]],
            'exclusions' => [],
        ])->assertOk();

        // 自分の旧データは消え、新データに置き換わる
        $this->assertDatabaseMissing('owned_items', ['user_id' => $me->id, 'name' => '旧アイテム']);
        $this->assertDatabaseHas('owned_items', ['user_id' => $me->id, 'name' => '新アイテム', 'count' => 5]);
        // 他ユーザーのデータは保持
        $this->assertDatabaseHas('owned_items', ['user_id' => $other->id, 'name' => '他人の剣']);
    }

    public function test_POSTとメソッドオーバーライドでもPUTハンドラに到達し保存できる(): void
    {
        // 本番（さくら）の WAF が実ボディ付き PUT を弾くため、フロントは
        // POST + X-HTTP-Method-Override: PUT で送る。その経路でも保存できることを保証する。
        $user = $this->makeUser();

        $this->actingAs($user, 'sanctum')->postJson(
            '/api/mypage/inventory',
            [
                'accounts'   => [['key' => 'n1', 'name' => '新']],
                'items'      => [['account_key' => 'n1', 'name' => 'オーバーライド剣', 'count' => 2]],
                'exclusions' => [],
            ],
            ['X-HTTP-Method-Override' => 'PUT'],
        )->assertOk();

        $this->assertDatabaseHas('owned_items', ['user_id' => $user->id, 'name' => 'オーバーライド剣', 'count' => 2]);
    }

    public function test_名前が無い行はバリデーションエラーになる(): void
    {
        $user = $this->makeUser();
        $this->actingAs($user, 'sanctum')->putJson('/api/mypage/inventory', [
            'accounts'   => [],
            'items'      => [['count' => 1]], // name 必須
            'exclusions' => [],
        ])->assertStatus(422)->assertJsonValidationErrors('items.0.name');
    }
}
