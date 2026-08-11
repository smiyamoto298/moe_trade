<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * 装備セットの特殊条件を「全部位共通」へ統一するデータ移行。
 * 旧UIでは特殊条件が追加効果の設定グループ内にあり、グループを分けた場合に
 * 一部の部位にしか特殊条件が入っていないデータが存在し得た。
 * 特殊条件を独立した設定グループへ分離するのに合わせ、既存データは
 * 各セットの構成部位（テクニック部位を除く）が持つ特殊条件の和集合を全部位へ適用する。
 */
return new class extends Migration
{
    public function up(): void
    {
        // テクニック配下のカテゴリ（特殊条件を持たない部位）は統一の対象外
        $techniqueTop = DB::table('item_categories')
            ->whereNull('parent_id')->where('name', 'テクニック')->value('id');
        $techniqueIds = $techniqueTop
            ? array_map('intval', DB::table('item_categories')
                ->where('parent_id', $techniqueTop)->pluck('id')->push($techniqueTop)->all())
            : [];

        $setIds = DB::table('items')->where('is_equipment_set', true)->pluck('id');

        foreach ($setIds as $setId) {
            $members = DB::table('equipment_set_members')
                ->join('items', 'items.id', '=', 'equipment_set_members.piece_item_id')
                ->where('equipment_set_members.set_item_id', $setId)
                ->orderBy('equipment_set_members.sort_order')
                ->get(['items.id', 'items.category_id', 'items.special_conditions']);

            $equipMembers = $members->reject(
                fn ($m) => in_array((int) $m->category_id, $techniqueIds, true)
            );
            if ($equipMembers->isEmpty()) {
                continue;
            }

            // 部位の並び順（sort_order）を保った和集合
            $union = [];
            foreach ($equipMembers as $m) {
                foreach ((json_decode($m->special_conditions ?? '[]', true) ?: []) as $cond) {
                    if (! in_array($cond, $union, true)) {
                        $union[] = $cond;
                    }
                }
            }
            if ($union === []) {
                continue;
            }

            foreach ($equipMembers as $m) {
                $current = json_decode($m->special_conditions ?? '[]', true) ?: [];
                if ($current !== $union) {
                    DB::table('items')->where('id', $m->id)->update([
                        'special_conditions' => json_encode($union, JSON_UNESCAPED_UNICODE),
                        'updated_at'         => now(),
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        // 部位ごとの旧状態は復元できないため何もしない（統一後の状態を維持する）
    }
};
