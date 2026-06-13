<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 宣伝ポストの状態（前回ツイート時刻）を1行で保持するテーブル。
 * 単日モードの集計開始時刻のデフォルトに使う。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promo_tweet_states', function (Blueprint $table) {
            $table->id();
            // 最後に「Xでポスト」した時刻（UTC保存）。未投稿なら null
            $table->timestamp('last_posted_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promo_tweet_states');
    }
};
