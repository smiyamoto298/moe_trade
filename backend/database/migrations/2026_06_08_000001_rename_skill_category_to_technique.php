<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // ルートカテゴリ「スキル」を「テクニック」に改名
        DB::table('item_categories')
            ->whereNull('parent_id')
            ->where('name', 'スキル')
            ->update(['name' => 'テクニック']);
    }

    public function down(): void
    {
        DB::table('item_categories')
            ->whereNull('parent_id')
            ->where('name', 'テクニック')
            ->update(['name' => 'スキル']);
    }
};
