<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 期限切れ前日の Web Push 通知の送信済み時刻。
 *
 * `trades:notify-expiring` バッチが通知を送るとセットし、同じ期限に対する再送を防ぐ。
 * 期限（expires_at）が変更されたらモデル側（saving フック）で null に戻し、
 * 新しい期限の前日に改めて通知できるようにする。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('listings', function (Blueprint $table) {
            $table->timestamp('expiry_notified_at')->nullable()->after('expires_at');
        });
        Schema::table('buy_requests', function (Blueprint $table) {
            $table->timestamp('expiry_notified_at')->nullable()->after('expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('listings', function (Blueprint $table) {
            $table->dropColumn('expiry_notified_at');
        });
        Schema::table('buy_requests', function (Blueprint $table) {
            $table->dropColumn('expiry_notified_at');
        });
    }
};
