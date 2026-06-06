<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // スキルアイテムの必要スキル値 {"筋力": 50, "刀剣": 80} 形式
            $table->json('skill_requirements')->nullable()->after('set_piece_category_ids');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('skill_requirements');
        });
    }
};
