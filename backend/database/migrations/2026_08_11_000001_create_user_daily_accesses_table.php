<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// 日ごとのユニークアクセスユーザー記録。認証済みAPIリクエストのあった (ユーザー, JST日付) を1行だけ持つ。
// 利用状況解析の「アクセスユーザー」系列の集計元。
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_daily_accesses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // JST（Asia/Tokyo）の日付。集計時のタイムゾーン変換を不要にするため日付で保存する
            $table->date('date');
            $table->unique(['user_id', 'date']);
            $table->index('date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_daily_accesses');
    }
};
