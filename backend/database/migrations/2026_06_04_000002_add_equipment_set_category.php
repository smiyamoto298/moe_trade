<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 既に存在する場合は追加しない（再実行時の重複防止）
        $exists = DB::table('item_categories')
            ->whereNull('parent_id')
            ->where('name', '装備セット')
            ->exists();

        if (!$exists) {
            // 既存の最大 sort_order を取得して末尾に追加
            $maxSort = DB::table('item_categories')->whereNull('parent_id')->max('sort_order') ?? -1;

            DB::table('item_categories')->insert([
                'parent_id'  => null,
                'name'       => '装備セット',
                'sort_order' => $maxSort + 1,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('item_categories')
            ->whereNull('parent_id')
            ->where('name', '装備セット')
            ->delete();
    }
};
