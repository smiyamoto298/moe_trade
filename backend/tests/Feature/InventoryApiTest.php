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
            ->assertJsonPath('exclusions', ['ゴミ', '木の枝']); // name 昇順（カタカナ→漢字）

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
