<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * お知らせの表示対象ユーザーを限定する設定。
 * - target_type: all（全員・デフォルト） / staff（管理・編集者のみ） / specific（指定ユーザーのみ）
 * - target_user_ids: target_type=specific のときの対象ユーザーID配列（それ以外は NULL）
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->string('target_type', 20)->default('all')->after('is_active');
            $table->json('target_user_ids')->nullable()->after('target_type');
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->dropColumn(['target_type', 'target_user_ids']);
        });
    }
};
