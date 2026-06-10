<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 取引チャットを「出品(listing)」だけでなく「買取(buy_request)」にも対応させる。
 * listing_id を NULL 許可にし、buy_request_id を追加して相互排他で利用する。
 */
return new class extends Migration
{
    public function up(): void
    {
        // listing_id を nullable に変更（買取チャットでは null になる）
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->foreignId('listing_id')->nullable()->change();
        });

        // buy_request_id を追加（買取チャットで使用）
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->foreignId('buy_request_id')
                ->nullable()
                ->after('listing_id')
                ->constrained('buy_requests')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->dropConstrainedForeignId('buy_request_id');
        });
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->foreignId('listing_id')->nullable(false)->change();
        });
    }
};
