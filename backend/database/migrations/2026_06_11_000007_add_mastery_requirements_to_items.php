<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // テクニックの発動に必要なマスタリのコード配列 ["WAR", "ALC"] 形式。
            // マスタリは構成スキルを全て40取得することで発動する効果。
            $table->json('mastery_requirements')->nullable()->after('skill_requirements');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('mastery_requirements');
        });
    }
};
