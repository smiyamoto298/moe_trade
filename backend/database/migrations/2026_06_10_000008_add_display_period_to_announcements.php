<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * お知らせに表示期間を追加する。
 *  - display_days : 表示する日数（null = 無期限）
 *  - expires_at   : 表示終了日時（created_at + display_days を保存。null = 無期限）
 * 期限切れ（expires_at < now）のお知らせは日次バッチで削除する。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->unsignedInteger('display_days')->nullable()->after('is_active');
            $table->timestamp('expires_at')->nullable()->index()->after('display_days');
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->dropColumn(['display_days', 'expires_at']);
        });
    }
};
