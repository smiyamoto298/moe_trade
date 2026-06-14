<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // 「その他」種別の固有パラメータ
            $table->string('pet_name', 100)->nullable()->after('special_function');     // 未開封ペット: ペット名
            $table->string('recipe_name', 200)->nullable()->after('pet_name');           // レシピ: レシピ名
            $table->string('recipe_binder', 100)->nullable()->after('recipe_name');      // レシピ: バインダー（項目名管理）
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['pet_name', 'recipe_name', 'recipe_binder']);
        });
    }
};
