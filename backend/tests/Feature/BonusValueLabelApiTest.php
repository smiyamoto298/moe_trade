<?php

namespace Tests\Feature;

use App\Models\BonusValueLabel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BonusValueLabelApiTest extends TestCase
{
    use RefreshDatabase;

    private function editor()
    {
        return $this->makeUserWithRole('editor');
    }

    public function test_公開候補は整理済み並び順の次に未整理を文字順で返す(): void
    {
        BonusValueLabel::create(['label' => '攻撃力', 'is_organized' => true, 'sort_order' => 1]);
        BonusValueLabel::create(['label' => '防御力', 'is_organized' => true, 'sort_order' => 0]);
        // 未整理（sort_order は持たない）。文字順で並ぶこと。
        BonusValueLabel::create(['label' => '魔力', 'is_organized' => false, 'sort_order' => 0]);
        BonusValueLabel::create(['label' => '回避', 'is_organized' => false, 'sort_order' => 0]);

        $res = $this->getJson('/api/bonus-value-labels');

        $res->assertOk();
        // 整理済み(sort_order昇順) → 未整理(文字順: 回避→魔力)
        $res->assertExactJson(['防御力', '攻撃力', '回避', '魔力']);
    }

    public function test_手動追加した項目は未整理として登録される(): void
    {
        $res = $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/admin/bonus-value-labels', ['label' => '命中']);

        $res->assertCreated();
        $this->assertDatabaseHas('bonus_value_labels', [
            'label'        => '命中',
            'is_organized' => false,
        ]);
    }

    public function test_organizeは渡したidを整理済みにし他を未整理へ戻す(): void
    {
        $a = BonusValueLabel::create(['label' => '攻撃力', 'is_organized' => false, 'sort_order' => 0]);
        $b = BonusValueLabel::create(['label' => '防御力', 'is_organized' => true, 'sort_order' => 5]);
        $c = BonusValueLabel::create(['label' => '魔力', 'is_organized' => true, 'sort_order' => 6]);

        // a, c を整理済み(この順)に。b は整理済みから外れる。
        $res = $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/admin/bonus-value-labels/organize', ['ids' => [$a->id, $c->id]]);

        $res->assertNoContent();

        $this->assertDatabaseHas('bonus_value_labels', ['id' => $a->id, 'is_organized' => true, 'sort_order' => 0]);
        $this->assertDatabaseHas('bonus_value_labels', ['id' => $c->id, 'is_organized' => true, 'sort_order' => 1]);
        // b は未整理に戻る
        $this->assertDatabaseHas('bonus_value_labels', ['id' => $b->id, 'is_organized' => false, 'sort_order' => 0]);
    }

    public function test_organizeに空配列を渡すと全て未整理になる(): void
    {
        $a = BonusValueLabel::create(['label' => '攻撃力', 'is_organized' => true, 'sort_order' => 0]);

        $res = $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/admin/bonus-value-labels/organize', ['ids' => []]);

        $res->assertNoContent();
        $this->assertDatabaseHas('bonus_value_labels', ['id' => $a->id, 'is_organized' => false]);
    }

    public function test_自動追加された項目名は未整理になる(): void
    {
        BonusValueLabel::syncFromBonusEffects([
            ['values' => [['value' => 10, 'label' => '吸収']]],
        ]);

        $this->assertDatabaseHas('bonus_value_labels', [
            'label'        => '吸収',
            'is_organized' => false,
        ]);
    }

    public function test_一般ユーザーはorganizeできない(): void
    {
        $this->actingAs($this->makeUser(), 'sanctum')
            ->postJson('/api/admin/bonus-value-labels/organize', ['ids' => []])
            ->assertForbidden();
    }

    // ---- 種別（kind）: bonus=付加効果の項目名 / stat=追加効果「その他」の項目名 ----

    public function test_公開候補はkindで絞り込める_未指定はbonus(): void
    {
        BonusValueLabel::create(['kind' => 'bonus', 'label' => '攻撃力', 'is_organized' => false, 'sort_order' => 0]);
        BonusValueLabel::create(['kind' => 'stat', 'label' => '釣り', 'is_organized' => false, 'sort_order' => 0]);

        // kind 未指定は従来どおり bonus のみ（後方互換）
        $this->getJson('/api/bonus-value-labels')->assertOk()->assertExactJson(['攻撃力']);
        $this->getJson('/api/bonus-value-labels?kind=stat')->assertOk()->assertExactJson(['釣り']);
        $this->getJson('/api/bonus-value-labels?kind=bogus')->assertStatus(422);
    }

    public function test_管理一覧もkindで絞り込める(): void
    {
        BonusValueLabel::create(['kind' => 'bonus', 'label' => '攻撃力', 'is_organized' => false, 'sort_order' => 0]);
        BonusValueLabel::create(['kind' => 'stat', 'label' => '釣り', 'is_organized' => false, 'sort_order' => 0]);

        $res = $this->actingAs($this->editor(), 'sanctum')
            ->getJson('/api/admin/bonus-value-labels?kind=stat');
        $res->assertOk();
        $this->assertSame(['釣り'], array_column($res->json(), 'label'));
    }

    public function test_kind指定で追加でき_同名でも種別が違えば登録できる(): void
    {
        BonusValueLabel::create(['kind' => 'bonus', 'label' => '攻撃力', 'is_organized' => false, 'sort_order' => 0]);

        // 同名でも stat 側には登録できる
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/admin/bonus-value-labels', ['label' => '攻撃力', 'kind' => 'stat'])
            ->assertCreated();
        $this->assertDatabaseHas('bonus_value_labels', ['kind' => 'stat', 'label' => '攻撃力', 'is_organized' => false]);

        // 同一種別内の重複は 422
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/admin/bonus-value-labels', ['label' => '攻撃力', 'kind' => 'stat'])
            ->assertStatus(422);
    }

    public function test_organizeは同一kind内だけを対象にする(): void
    {
        $bonus = BonusValueLabel::create(['kind' => 'bonus', 'label' => '攻撃力', 'is_organized' => true, 'sort_order' => 0]);
        $statA = BonusValueLabel::create(['kind' => 'stat', 'label' => '釣り', 'is_organized' => false, 'sort_order' => 0]);
        $statB = BonusValueLabel::create(['kind' => 'stat', 'label' => '採掘', 'is_organized' => true, 'sort_order' => 3]);

        // stat 側だけ整理。bonus 側の整理状態は変わらない。
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/admin/bonus-value-labels/organize', ['ids' => [$statA->id], 'kind' => 'stat'])
            ->assertNoContent();

        $this->assertDatabaseHas('bonus_value_labels', ['id' => $statA->id, 'is_organized' => true, 'sort_order' => 0]);
        $this->assertDatabaseHas('bonus_value_labels', ['id' => $statB->id, 'is_organized' => false, 'sort_order' => 0]);
        $this->assertDatabaseHas('bonus_value_labels', ['id' => $bonus->id, 'is_organized' => true, 'sort_order' => 0]);
    }

    public function test_organizeは他kindのidを受け付けない(): void
    {
        $bonus = BonusValueLabel::create(['kind' => 'bonus', 'label' => '攻撃力', 'is_organized' => false, 'sort_order' => 0]);

        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/admin/bonus-value-labels/organize', ['ids' => [$bonus->id], 'kind' => 'stat'])
            ->assertStatus(422);
    }

    public function test_base_statsのその他キーがstat候補として自動追加される(): void
    {
        BonusValueLabel::syncFromBaseStats(['atk' => 10, '釣り' => 5, '' => 1]);

        // 固定キー(atk)と空文字は候補化されず、自由入力キーのみ stat として追加される
        $this->assertDatabaseHas('bonus_value_labels', ['kind' => 'stat', 'label' => '釣り', 'is_organized' => false]);
        $this->assertDatabaseMissing('bonus_value_labels', ['label' => 'atk']);
        $this->assertSame(1, BonusValueLabel::count());
    }

    // ---- 統合（merge）: 未整理の項目名を整理済みへ寄せ、使用アイテム側も更新 ----

    public function test_statの統合はアイテムのbase_statsキーを付け替えて統合元を削除する(): void
    {
        $source = BonusValueLabel::create(['kind' => 'stat', 'label' => '釣リ', 'is_organized' => false, 'sort_order' => 0]);
        $target = BonusValueLabel::create(['kind' => 'stat', 'label' => '釣り', 'is_organized' => true, 'sort_order' => 0]);

        $itemA = $this->makeItem(['name' => '統合対象の剣A', 'base_stats' => ['atk' => 10, '釣リ' => 5]]);
        // 統合先キーを既に持つアイテムは既存値を優先し、統合元キーだけ取り除く
        $itemB = $this->makeItem(['name' => '統合対象の剣B', 'category_id' => $itemA->category_id, 'base_stats' => ['釣リ' => 3, '釣り' => 7]]);
        $itemC = $this->makeItem(['name' => '無関係の剣', 'category_id' => $itemA->category_id, 'base_stats' => ['atk' => 1]]);

        $res = $this->actingAs($this->editor(), 'sanctum')
            ->postJson("/api/admin/bonus-value-labels/{$source->id}/merge", ['target_id' => $target->id]);

        $res->assertOk()
            ->assertJsonPath('merged_into.label', '釣り')
            ->assertJsonPath('updated_count', 2);

        $this->assertSame(['atk' => 10, '釣り' => 5], $itemA->fresh()->base_stats);
        $this->assertSame(['釣り' => 7], $itemB->fresh()->base_stats);
        $this->assertSame(['atk' => 1], $itemC->fresh()->base_stats);
        // 統合元は削除される
        $this->assertDatabaseMissing('bonus_value_labels', ['id' => $source->id]);
    }

    public function test_bonusの統合は付加効果の値の項目名を付け替えて統合元を削除する(): void
    {
        $source = BonusValueLabel::create(['kind' => 'bonus', 'label' => '物理ダメ', 'is_organized' => false, 'sort_order' => 0]);
        $target = BonusValueLabel::create(['kind' => 'bonus', 'label' => '物理ダメージ', 'is_organized' => true, 'sort_order' => 0]);

        $item = $this->makeItem(['name' => '統合対象の剣', 'base_stats' => []]);
        $effect = $item->bonusEffects()->create([
            'effect_name' => '剛剣の使い手',
            'values' => [
                ['value' => 15, 'value_unit' => '%', 'label' => '物理ダメ'],
                ['value' => -5, 'value_unit' => '%', 'label' => '命中'],
            ],
        ]);

        $res = $this->actingAs($this->editor(), 'sanctum')
            ->postJson("/api/admin/bonus-value-labels/{$source->id}/merge", ['target_id' => $target->id]);

        $res->assertOk()->assertJsonPath('updated_count', 1);

        $values = $effect->fresh()->values;
        $this->assertSame('物理ダメージ', $values[0]['label']);
        $this->assertSame('命中', $values[1]['label']);
        $this->assertDatabaseMissing('bonus_value_labels', ['id' => $source->id]);
    }

    public function test_統合のバリデーション_未整理から整理済みへ同一種別のみ(): void
    {
        $editor = $this->editor();
        $unorganizedStat  = BonusValueLabel::create(['kind' => 'stat', 'label' => '釣リ', 'is_organized' => false, 'sort_order' => 0]);
        $unorganizedStat2 = BonusValueLabel::create(['kind' => 'stat', 'label' => '採掘', 'is_organized' => false, 'sort_order' => 0]);
        $organizedStat    = BonusValueLabel::create(['kind' => 'stat', 'label' => '釣り', 'is_organized' => true, 'sort_order' => 0]);
        $organizedBonus   = BonusValueLabel::create(['kind' => 'bonus', 'label' => '物理ダメージ', 'is_organized' => true, 'sort_order' => 0]);

        // 種別が異なる統合先は 422
        $this->actingAs($editor, 'sanctum')
            ->postJson("/api/admin/bonus-value-labels/{$unorganizedStat->id}/merge", ['target_id' => $organizedBonus->id])
            ->assertStatus(422);
        // 未整理の統合先は 422
        $this->actingAs($editor, 'sanctum')
            ->postJson("/api/admin/bonus-value-labels/{$unorganizedStat->id}/merge", ['target_id' => $unorganizedStat2->id])
            ->assertStatus(422);
        // 整理済みを統合元にはできない（422）
        $this->actingAs($editor, 'sanctum')
            ->postJson("/api/admin/bonus-value-labels/{$organizedStat->id}/merge", ['target_id' => $organizedStat->id])
            ->assertStatus(422);
        // 存在しない統合先は 422（exists）
        $this->actingAs($editor, 'sanctum')
            ->postJson("/api/admin/bonus-value-labels/{$unorganizedStat->id}/merge", ['target_id' => 999999])
            ->assertStatus(422);

        // どの項目も削除されていない
        $this->assertSame(4, BonusValueLabel::count());
    }

    public function test_統合はeditor以上のみ(): void
    {
        $source = BonusValueLabel::create(['kind' => 'stat', 'label' => '釣リ', 'is_organized' => false, 'sort_order' => 0]);
        $target = BonusValueLabel::create(['kind' => 'stat', 'label' => '釣り', 'is_organized' => true, 'sort_order' => 0]);

        $this->actingAs($this->makeUser(), 'sanctum')
            ->postJson("/api/admin/bonus-value-labels/{$source->id}/merge", ['target_id' => $target->id])
            ->assertForbidden();
    }
}
