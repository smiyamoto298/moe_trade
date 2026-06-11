<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BonusValueLabel extends Model
{
    public $timestamps = false;

    protected $fillable = ['label', 'sort_order'];

    protected $casts = [
        'sort_order' => 'integer',
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

        // 末尾に追加（並び順は既存の最大値の次から連番）
        $order = (int) (static::max('sort_order') ?? -1) + 1;
        $rows  = [];
        foreach ($missing as $label) {
            $rows[] = ['label' => $label, 'sort_order' => $order++];
        }
        // 競合（同時登録）を考慮し、重複は無視して挿入
        static::insertOrIgnore($rows);
    }
}
