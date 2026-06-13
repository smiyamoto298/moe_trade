<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 管理者が登録する「共通の除外アイテム」。
 * アイテムボックスの貼り付け（所持品管理・一括出品）で、ここに登録された名前は除外される。
 * 判定はアイテム名（文字列）単位。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('excluded_items', function (Blueprint $table) {
            $table->id();
            $table->string('name', 200)->unique();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('excluded_items');
    }
};
