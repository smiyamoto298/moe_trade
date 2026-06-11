<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * 既存の装備セット（旧モデル: items.set_piece_category_ids のみ保持）を新モデルへ自動変換する。
 * 各構成部位カテゴリごとに部位アイテムを生成し、equipment_set_members で紐付ける。
 * 旧モデルではセット本体に追加効果・付加効果・その他設定を1つだけ持っていたため、
 * それらを各部位へコピーする（部位ごとに同じ設定を引き継ぐ）。
 * 既に部位が紐付いているセットはスキップする（再実行・二重変換の防止）。
 */
return new class extends Migration
{
    public function up(): void
    {
        $sets = DB::table('items')
            ->where('is_equipment_set', true)
            ->whereNotNull('set_piece_category_ids')
            ->get([
                'id', 'name', 'set_piece_category_ids',
                // セット本体の設定（各部位へコピーする）
                'base_stats', 'special_conditions', 'dyeable', 'mithril', 'exclusive_skill',
                'verified_status', 'submitted_by', 'verified_by', 'verified_at', 'locked_by_staff',
            ]);

        $categoryNames = DB::table('item_categories')->pluck('name', 'id');

        foreach ($sets as $set) {
            // 既に部位が紐付いているセットは変換済みとみなしてスキップ
            $already = DB::table('equipment_set_members')->where('set_item_id', $set->id)->exists();
            if ($already) {
                continue;
            }

            $categoryIds = json_decode($set->set_piece_category_ids ?? '[]', true) ?: [];
            $sort = 0;

            // セット本体の付加効果（item_bonus_effects）を取得して各部位へ複製する
            $bonusEffects = DB::table('item_bonus_effects')
                ->where('item_id', $set->id)
                ->get(['effect_name', 'values', 'description']);

            foreach ($categoryIds as $categoryId) {
                $categoryName = $categoryNames[$categoryId] ?? '部位';
                $baseName = "{$set->name} - {$categoryName}";
                $name = $baseName;

                // items.name はユニーク制約。衝突時はサフィックスで一意化する。
                $suffix = 2;
                while (DB::table('items')->where('name', $name)->exists()) {
                    $name = "{$baseName} ({$suffix})";
                    $suffix++;
                }

                $pieceId = DB::table('items')->insertGetId([
                    'category_id'      => $categoryId,
                    'name'             => $name,
                    // セット本体の追加効果・その他設定をコピー
                    'base_stats'         => $set->base_stats ?? json_encode((object) []),
                    'special_conditions' => $set->special_conditions ?? json_encode([]),
                    'dyeable'            => $set->dyeable,
                    'mithril'            => $set->mithril ?? false,
                    'exclusive_skill'    => $set->exclusive_skill ?? false,
                    'is_equipment_set' => false,
                    'verified_status'  => $set->verified_status,
                    'submitted_by'     => $set->submitted_by,
                    'verified_by'      => $set->verified_by,
                    'verified_at'      => $set->verified_at,
                    'locked_by_staff'  => $set->locked_by_staff,
                    'created_at'       => now(),
                    'updated_at'       => now(),
                ]);

                // セット本体の付加効果を部位へコピー
                foreach ($bonusEffects as $be) {
                    DB::table('item_bonus_effects')->insert([
                        'item_id'     => $pieceId,
                        'effect_name' => $be->effect_name,
                        'values'      => $be->values,
                        'description' => $be->description,
                    ]);
                }

                DB::table('equipment_set_members')->insert([
                    'set_item_id'   => $set->id,
                    'piece_item_id' => $pieceId,
                    'sort_order'    => $sort++,
                ]);
            }
        }
    }

    public function down(): void
    {
        // 変換で生成した部位アイテムを削除（メンバー行は cascade で消える）。
        $pieceIds = DB::table('equipment_set_members')->pluck('piece_item_id')->unique()->all();
        if (!empty($pieceIds)) {
            DB::table('items')->whereIn('id', $pieceIds)->delete();
        }
    }
};
