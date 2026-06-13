<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ユーザーが自分で管理する「個別の除外アイテム」。
 * 共通の除外（excluded_items）とマージして貼り付け時に除外する。
 * 保存先が「DB」のときに使用する（ローカルストレージ保存時はクライアント側に持つ）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_excluded_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 200);
            $table->timestamps();

            $table->unique(['user_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_excluded_items');
    }
};
