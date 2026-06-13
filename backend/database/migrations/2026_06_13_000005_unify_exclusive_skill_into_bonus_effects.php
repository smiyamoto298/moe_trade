<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 専用技をアイテム単位の `items.exclusive_skill` から付加効果単位の
 * `item_bonus_effects.is_exclusive` へ一本化する。
 *
 * - up: exclusive_skill=true だったアイテムの付加効果を全て is_exclusive=true にバックフィルし、
 *   その後 items.exclusive_skill 列を削除する。
 *   （旧モデルは「アイテムに専用技が含まれるか」という粒度しか持たないため、
 *    そのアイテムの付加効果すべてを専用技として引き継ぐ。付加効果を持たない場合は表現できず失われる）
 * - down: 列を再作成し、is_exclusive な付加効果を持つアイテムを exclusive_skill=true に戻す。
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('items', 'exclusive_skill')) {
            $exclusiveItemIds = DB::table('items')->where('exclusive_skill', true)->pluck('id');
            if ($exclusiveItemIds->isNotEmpty()) {
                DB::table('item_bonus_effects')
                    ->whereIn('item_id', $exclusiveItemIds)
                    ->update(['is_exclusive' => true]);
            }

            Schema::table('items', function (Blueprint $table) {
                $table->dropColumn('exclusive_skill');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('items', 'exclusive_skill')) {
            Schema::table('items', function (Blueprint $table) {
                $table->boolean('exclusive_skill')->default(false)->after('mithril');
            });
        }

        $exclusiveItemIds = DB::table('item_bonus_effects')
            ->where('is_exclusive', true)
            ->distinct()
            ->pluck('item_id');
        if ($exclusiveItemIds->isNotEmpty()) {
            DB::table('items')->whereIn('id', $exclusiveItemIds)->update(['exclusive_skill' => true]);
        }
    }
};
