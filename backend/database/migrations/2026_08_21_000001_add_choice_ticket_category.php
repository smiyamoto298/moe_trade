<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 最上位カテゴリ「その他」の子カテゴリに「選べるチケット」を追加する。
        // （既存の子: 未開封ペット / レシピ / ペット用アイテム / アイテムセット）
        // アイテムセットと同じく set_items（アイテム名の文字列配列）に候補アイテムを持たせる。
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

        $exists = DB::table('item_categories')
            ->where('parent_id', $parentId)
            ->where('name', '選べるチケット')
            ->exists();

        if (!$exists) {
            $maxChildSort = (int) DB::table('item_categories')->where('parent_id', $parentId)->max('sort_order');
            DB::table('item_categories')->insert([
                'parent_id'  => $parentId,
                'name'       => '選べるチケット',
                'sort_order' => $maxChildSort + 1,
            ]);
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
                ->where('name', '選べるチケット')
                ->delete();
        }
    }
};
