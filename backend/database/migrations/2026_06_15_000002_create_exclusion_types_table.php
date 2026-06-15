<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 共通除外アイテムの「種別」（カテゴリ）。管理者が任意で追加できる。
 * 各 excluded_items はいずれか1つの種別に属する。既定種別は「その他」（削除不可・改名可）。
 * ユーザーは所有アイテム管理画面で「適用する種別」を選べる。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exclusion_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->boolean('is_default')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // 既定種別「その他」を投入する（種別未指定の除外アイテムの受け皿）。
        DB::table('exclusion_types')->insert([
            'name'       => 'その他',
            'is_default' => true,
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('exclusion_types');
    }
};
