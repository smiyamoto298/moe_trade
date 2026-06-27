<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listings', function (Blueprint $table) {
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
            // completed / deal_failed は後続マイグレーション（MySQL用ALTER）でも追加されるが、
            // SQLite（テスト環境）ではCHECK制約が作成時に固定されるため最初から全ステータスを定義する。
            $table->enum('status', ['active', 'expired', 'cancelled', 'completed', 'deal_failed'])->default('active');
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listings');
    }
};
