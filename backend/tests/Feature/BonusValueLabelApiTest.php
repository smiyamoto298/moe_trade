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
}
