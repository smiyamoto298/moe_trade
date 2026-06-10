<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 取引履歴を買取(buy_request)由来の成立にも対応させる。
 * listing_id を NULL 許可にし、buy_request_id を追加する。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trade_history', function (Blueprint $table) {
            $table->foreignId('listing_id')->nullable()->change();
        });

        Schema::table('trade_history', function (Blueprint $table) {
            $table->foreignId('buy_request_id')
                ->nullable()
                ->after('listing_id')
                ->constrained('buy_requests')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('trade_history', function (Blueprint $table) {
            $table->dropConstrainedForeignId('buy_request_id');
        });
        Schema::table('trade_history', function (Blueprint $table) {
            $table->foreignId('listing_id')->nullable(false)->change();
        });
    }
};
