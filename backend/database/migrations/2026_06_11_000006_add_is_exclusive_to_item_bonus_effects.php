<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 付加効果ごとに「専用技」フラグを持たせる。
 * 装備セットの部位では、専用技は各付加効果（付加効果1,2…）単位で設定する。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('item_bonus_effects', function (Blueprint $table) {
            $table->boolean('is_exclusive')->default(false)->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('item_bonus_effects', function (Blueprint $table) {
            $table->dropColumn('is_exclusive');
        });
    }
};
