<?php

namespace Database\Seeders;

use App\Models\BonusValueLabel;
use App\Models\ItemBonusEffect;
use Illuminate\Database\Seeder;

class BonusValueLabelSeeder extends Seeder
{
    public function run(): void
    {
        // 現時点で登録済みのアイテム付加効果（item_bonus_effects）に含まれる
        // 項目名（values[*].label）を候補テーブルに投入する。
        // 既存分は重複追加されない（モデル側で除外）。
        $bonusEffects = ItemBonusEffect::whereNotNull('values')
            ->get()
            ->map(fn (ItemBonusEffect $e) => ['values' => $e->values ?? []])
            ->all();

        BonusValueLabel::syncFromBonusEffects($bonusEffects);
    }
}
