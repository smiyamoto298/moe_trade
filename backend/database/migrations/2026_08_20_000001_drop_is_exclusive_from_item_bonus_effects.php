<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 専用技（付加効果ごとの is_exclusive）を廃止する。
 * down では列を復元するが、どの付加効果が専用技だったかは復元できない（既定値 false になる）。
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('item_bonus_effects', 'is_exclusive')) {
            Schema::table('item_bonus_effects', function (Blueprint $table) {
                $table->dropColumn('is_exclusive');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('item_bonus_effects', 'is_exclusive')) {
            Schema::table('item_bonus_effects', function (Blueprint $table) {
                $table->boolean('is_exclusive')->default(false)->after('description');
            });
        }
    }
};
