<?php

use App\Models\BonusValueLabel;
use App\Models\ItemBonusEffect;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * 既存データの「命中力」表記を「命中」へ統一する。
     * 対象: bonus_value_labels.label / item_bonus_effects（effect_name・values の label・description）/ items.description
     * デプロイ時の migrate で自動実行される。
     */
    public function up(): void
    {
        // 付加効果の項目名候補。置換後のラベルが既に存在する場合は unique 制約に
        // 衝突するため、旧表記の行を削除して既存行へ寄せる。
        BonusValueLabel::where('label', 'like', '%命中力%')->get()
            ->each(function (BonusValueLabel $row) {
                $newLabel = str_replace('命中力', '命中', $row->label);
                if (BonusValueLabel::where('label', $newLabel)->exists()) {
                    $row->delete();
                } else {
                    $row->update(['label' => $newLabel]);
                }
            });

        // 付加効果の効果名・説明・数値項目ラベル。
        // values は JSON カラムで DB ごとにユニコードエスケープの有無が異なり
        // LIKE で確実に絞り込めないため、全行を PHP 側で置換する。
        ItemBonusEffect::query()->chunkById(200, function ($effects) {
            foreach ($effects as $effect) {
                $changed = false;

                foreach (['effect_name', 'description'] as $column) {
                    $original = $effect->{$column};
                    if (is_string($original) && str_contains($original, '命中力')) {
                        $effect->{$column} = str_replace('命中力', '命中', $original);
                        $changed = true;
                    }
                }

                $values = $effect->values;
                if (is_array($values)) {
                    foreach ($values as $i => $value) {
                        $label = $value['label'] ?? null;
                        if (is_string($label) && str_contains($label, '命中力')) {
                            $values[$i]['label'] = str_replace('命中力', '命中', $label);
                            $changed = true;
                        }
                    }
                    if ($changed) {
                        $effect->values = $values;
                    }
                }

                if ($changed) {
                    $effect->save();
                }
            }
        });

        // アイテム説明文（REPLACE は MySQL / SQLite 共通で利用可能）
        DB::table('items')
            ->where('description', 'like', '%命中力%')
            ->update(['description' => DB::raw("REPLACE(description, '命中力', '命中')")]);
    }

    public function down(): void
    {
        // 表記統一のデータ置換のみのため、ロールバックでは何もしない。
    }
};
