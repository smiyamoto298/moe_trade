<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * オークションの入札情報を取引チャットに持たせる。
 * - bid_price: 入札額（オークションの取引希望＝入札。非オークションは null）
 * - outbid_at: より有利な入札に抜かれた時刻（他の入札者への「価格更新」通知に使う。先頭入札は null）
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->integer('bid_price')->nullable()->after('server');
            $table->timestamp('outbid_at')->nullable()->after('bid_price');
        });
    }

    public function down(): void
    {
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->dropColumn(['bid_price', 'outbid_at']);
        });
    }
};
