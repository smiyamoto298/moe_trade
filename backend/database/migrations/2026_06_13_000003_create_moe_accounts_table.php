<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 所持アイテム管理用の MoE アカウント名（複数登録可）。
 * 公式サイトのアイテムボックスはアカウント単位のため、アカウントごとに所持品を整理する。
 * 取引用のキャラクター（user_characters・サーバー単位）とは別概念。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('moe_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 100);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('moe_accounts');
    }
};
