<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 買取（買いたい）の登録テーブル。
 * 構造は listings とほぼ対称だが、登録者(user_id)は「買い手」を表す。
 * is_worn（削れあり）は買取側には該当しないため持たない。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('buy_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items');
            $table->integer('price');
            $table->string('currency', 10)->default('AC');
            $table->integer('quantity')->default(1);
            // auction は後続マイグレーション（MySQL用ALTER）でも追加されるが、
            // SQLite（テスト環境）では ENUM が CHECK 制約として作成時に固定されるため最初から定義する。
            $table->enum('trade_type', ['fixed', 'negotiable', 'auction']);
            $table->text('comment')->nullable();
            $table->enum('status', ['active', 'expired', 'cancelled', 'completed', 'deal_failed'])->default('active');
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('buy_requests');
    }
};
