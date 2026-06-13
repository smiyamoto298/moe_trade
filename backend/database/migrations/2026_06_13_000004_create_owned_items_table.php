<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ユーザーの所持アイテム台帳（保存先が「DB」のとき使用）。
 * 公式サイトのアイテムボックスを貼り付けて登録する。
 * 登録アイテム（items）と紐づいていない状態でも保存できるよう item_id は nullable。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('owned_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // 所属 MoE アカウント。未割り当て（null）でも保持できる。
            $table->foreignId('moe_account_id')->nullable()->constrained('moe_accounts')->nullOnDelete();
            // 登録アイテムへの紐づけ（未紐づけは null）。
            $table->foreignId('item_id')->nullable()->constrained('items')->nullOnDelete();
            // 貼り付け由来の生データ
            $table->string('no')->nullable();
            $table->string('name', 200);
            $table->string('category', 100)->nullable();
            $table->integer('count')->default(0);
            // 出品時の希望価格メモ（任意）
            $table->integer('price')->nullable();
            // ステータス
            $table->boolean('is_worn')->default(false);   // 削れあり
            $table->boolean('is_dyed')->default(false);    // 染色済み
            $table->boolean('is_marked')->default(false);  // マーク
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('owned_items');
    }
};
