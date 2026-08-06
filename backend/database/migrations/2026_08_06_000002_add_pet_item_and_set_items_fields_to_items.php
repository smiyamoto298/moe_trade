<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // 「その他」種別の固有パラメータ（追加分）
            $table->string('target_pet', 100)->nullable()->after('recipe_binder');      // ペット用アイテム: 対象ペット
            $table->string('pet_item_effect', 500)->nullable()->after('target_pet');    // ペット用アイテム: 効果
            $table->json('set_items')->nullable()->after('pet_item_effect');            // アイテムセット: アイテム名リスト（文字列配列）
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['target_pet', 'pet_item_effect', 'set_items']);
        });
    }
};
