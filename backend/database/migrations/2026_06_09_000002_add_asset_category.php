<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 最上位カテゴリ「アセット」を追加（子カテゴリなし。種別自体として選択する）
        $exists = DB::table('item_categories')
            ->whereNull('parent_id')
            ->where('name', 'アセット')
            ->exists();

        if (!$exists) {
            $maxSort = (int) DB::table('item_categories')->whereNull('parent_id')->max('sort_order');
            DB::table('item_categories')->insert([
                'parent_id'  => null,
                'name'       => 'アセット',
                'sort_order' => $maxSort + 1,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('item_categories')
            ->whereNull('parent_id')
            ->where('name', 'アセット')
            ->delete();
    }
};
