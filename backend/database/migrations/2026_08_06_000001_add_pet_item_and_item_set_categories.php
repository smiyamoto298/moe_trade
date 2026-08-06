<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 最上位カテゴリ「その他」の子カテゴリに「ペット用アイテム」「アイテムセット」を追加する。
        // （既存の子: 未開封ペット / レシピ）
        $parent = DB::table('item_categories')
            ->whereNull('parent_id')
            ->where('name', 'その他')
            ->first();

        if (!$parent) {
            $maxSort = (int) DB::table('item_categories')->whereNull('parent_id')->max('sort_order');
            $parentId = DB::table('item_categories')->insertGetId([
                'parent_id'  => null,
                'name'       => 'その他',
                'sort_order' => $maxSort + 1,
            ]);
        } else {
            $parentId = $parent->id;
        }

        $maxChildSort = (int) DB::table('item_categories')->where('parent_id', $parentId)->max('sort_order');
        foreach (['ペット用アイテム', 'アイテムセット'] as $i => $name) {
            $exists = DB::table('item_categories')
                ->where('parent_id', $parentId)
                ->where('name', $name)
                ->exists();
            if (!$exists) {
                DB::table('item_categories')->insert([
                    'parent_id'  => $parentId,
                    'name'       => $name,
                    'sort_order' => $maxChildSort + 1 + $i,
                ]);
            }
        }
    }

    public function down(): void
    {
        $parent = DB::table('item_categories')
            ->whereNull('parent_id')
            ->where('name', 'その他')
            ->first();
        if ($parent) {
            DB::table('item_categories')
                ->where('parent_id', $parent->id)
                ->whereIn('name', ['ペット用アイテム', 'アイテムセット'])
                ->delete();
        }
    }
};
