<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 最上位カテゴリ「その他」を追加し、子カテゴリ「未開封ペット」「レシピ」を持たせる。
        // 既存種別に当てはまらないアイテムの受け皿（登録フォームで運営掲示板への連絡を案内する）。
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

        $children = ['未開封ペット', 'レシピ'];
        foreach ($children as $sort => $name) {
            $exists = DB::table('item_categories')
                ->where('parent_id', $parentId)
                ->where('name', $name)
                ->exists();
            if (!$exists) {
                DB::table('item_categories')->insert([
                    'parent_id'  => $parentId,
                    'name'       => $name,
                    'sort_order' => $sort,
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
            DB::table('item_categories')->where('parent_id', $parent->id)->delete();
            DB::table('item_categories')->where('id', $parent->id)->delete();
        }
    }
};
