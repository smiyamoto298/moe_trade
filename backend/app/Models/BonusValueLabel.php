<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BonusValueLabel extends Model
{
    public $timestamps = false;

    protected $fillable = ['label', 'is_organized', 'sort_order'];

    protected $casts = [
        'is_organized' => 'boolean',
        'sort_order'   => 'integer',
    ];

    /**
     * アイテムの付加効果（bonus_effects）に含まれる項目名（values[*].label）のうち、
     * まだ候補テーブルに存在しないものを末尾に追加する。
     * アイテム登録・更新時に呼び出し、新しい項目名を自動で候補化する。
     *
     * @param array $bonusEffects バリデーション済みの bonus_effects 配列
     */
    public static function syncFromBonusEffects(array $bonusEffects): void
    {
        // 入力から項目名を収集（前後空白除去・空文字や長すぎるものは除外・重複排除）
        $labels = [];
        foreach ($bonusEffects as $effect) {
            foreach ($effect['values'] ?? [] as $value) {
                $label = trim((string) ($value['label'] ?? ''));
                // label カラムは最大100文字。超過するものは候補化しない。
                if ($label === '' || mb_strlen($label) > 100) {
                    continue;
                }
                $labels[$label] = true;
            }
        }
        if (empty($labels)) {
            return;
        }
        $labels = array_keys($labels);

        // 既存の候補を除外
        $existing = static::whereIn('label', $labels)->pluck('label')->all();
        $missing  = array_values(array_diff($labels, $existing));
        if (empty($missing)) {
            return;
        }

        // 自動追加分は「未整理」として登録する。未整理は文字順で表示するため
        // 並び順(sort_order)は持たせない（0 固定）。管理者がドラッグで整理済みにした時に採番する。
        $rows = [];
        foreach ($missing as $label) {
            $rows[] = ['label' => $label, 'is_organized' => false, 'sort_order' => 0];
        }
        // 競合（同時登録）を考慮し、重複は無視して挿入
        static::insertOrIgnore($rows);
    }
}
