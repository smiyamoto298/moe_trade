<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 「新着扱い」用の freshness タイムスタンプ。
 *
 * 期限切れの再出品・再登録で「値下げ」または「即決→交渉可」に変更した取引を新着として扱うため、
 * その時点を bumped_at に記録する。新着順の並び替えと宣伝ツイートの対象選定は
 * COALESCE(bumped_at, created_at) を基準にする（未設定の通常出品は created_at と同じ挙動になる）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('listings', function (Blueprint $table) {
            $table->timestamp('bumped_at')->nullable()->after('expires_at');
        });
        Schema::table('buy_requests', function (Blueprint $table) {
            $table->timestamp('bumped_at')->nullable()->after('expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('listings', function (Blueprint $table) {
            $table->dropColumn('bumped_at');
        });
        Schema::table('buy_requests', function (Blueprint $table) {
            $table->dropColumn('bumped_at');
        });
    }
};
