<?php

namespace Tests\Feature;

use App\Models\BonusValueLabel;
use App\Models\ItemBonusEffect;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RenameHitStatLabelTest extends TestCase
{
    use RefreshDatabase;

    private function runMigration(): void
    {
        $migration = require base_path('database/migrations/2026_06_12_000001_rename_hit_stat_label.php');
        $migration->up();
    }

    public function test_既存データの命中力表記が命中へ置換される(): void
    {
        $item = $this->makeItem(['description' => '命中力+10 が付与された剣']);
        ItemBonusEffect::create([
            'item_id'     => $item->id,
            'effect_name' => '命中力上昇',
            'description' => '命中力が上がる',
            'values'      => [
                ['value' => 5, 'value_unit' => null, 'label' => '命中力'],
                ['value' => 3, 'value_unit' => '%', 'label' => '回避'],
            ],
        ]);
        BonusValueLabel::create(['label' => '命中力上昇', 'sort_order' => 10]);

        $this->runMigration();

        $this->assertSame('命中+10 が付与された剣', $item->fresh()->description);

        $effect = ItemBonusEffect::firstOrFail();
        $this->assertSame('命中上昇', $effect->effect_name);
        $this->assertSame('命中が上がる', $effect->description);
        $this->assertSame('命中', $effect->values[0]['label']);
        // 命中力を含まない項目は変更されない
        $this->assertSame('回避', $effect->values[1]['label']);
        $this->assertSame(5, $effect->values[0]['value']);

        $this->assertDatabaseHas('bonus_value_labels', ['label' => '命中上昇']);
        $this->assertDatabaseMissing('bonus_value_labels', ['label' => '命中力上昇']);
    }

    public function test_置換後のラベルが既に存在する場合は旧表記の候補を削除して統合する(): void
    {
        BonusValueLabel::create(['label' => '命中力', 'sort_order' => 1]);
        BonusValueLabel::create(['label' => '命中', 'sort_order' => 2]);

        $this->runMigration();

        $this->assertSame(1, BonusValueLabel::where('label', '命中')->count());
        $this->assertDatabaseMissing('bonus_value_labels', ['label' => '命中力']);
    }

    public function test_命中力を含まないデータは変更されない(): void
    {
        $item = $this->makeItem(['description' => '攻撃力+5 の剣']);
        ItemBonusEffect::create([
            'item_id'     => $item->id,
            'effect_name' => '剛剣の使い手',
            'values'      => [['value' => 15, 'value_unit' => '%', 'label' => '物理ダメージ']],
        ]);

        $this->runMigration();

        $this->assertSame('攻撃力+5 の剣', $item->fresh()->description);
        $effect = ItemBonusEffect::firstOrFail();
        $this->assertSame('剛剣の使い手', $effect->effect_name);
        $this->assertSame('物理ダメージ', $effect->values[0]['label']);
    }
}
