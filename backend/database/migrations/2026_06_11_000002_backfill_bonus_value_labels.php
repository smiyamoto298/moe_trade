<?php

use App\Models\BonusValueLabel;
use App\Models\ItemBonusEffect;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * 既存の登録済みアイテムの付加効果に含まれる項目名（values[*].label）を
     * 候補テーブルへ一度だけ投入する。デプロイ時の migrate で自動実行される。
     * 既存分は重複追加されない（モデル側で除外）。
     */
    public function up(): void
    {
        $bonusEffects = ItemBonusEffect::whereNotNull('values')
            ->get()
            ->map(fn (ItemBonusEffect $e) => ['values' => $e->values ?? []])
            ->all();

        BonusValueLabel::syncFromBonusEffects($bonusEffects);
    }

    public function down(): void
    {
        // データ投入のみのため、ロールバックでは何もしない。
    }
};
