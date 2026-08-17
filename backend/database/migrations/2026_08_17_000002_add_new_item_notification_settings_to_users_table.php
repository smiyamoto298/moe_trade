<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 通知種別「新規出品（listing）」「新規買取（buying）」のチャネル別 ON/OFF 列を追加する。
 *
 * 既存の trade / auction / expiry は「自分宛て」の通知のため既定 ON だが、
 * この2種別はサイト上の全出品・全買取が対象のブロードキャスト。既定 ON にすると
 * 既存ユーザー全員へ突然大量の通知が届いてしまうため、既定は OFF（希望者だけが
 * 設定画面で ON にするオプトイン方式）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('push_notify_listing')->default(false)->after('push_notify_expiry');
            $table->boolean('push_notify_buying')->default(false)->after('push_notify_listing');

            $table->boolean('email_notify_listing')->default(false)->after('email_notify_expiry');
            $table->boolean('email_notify_buying')->default(false)->after('email_notify_listing');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'push_notify_listing',
                'push_notify_buying',
                'email_notify_listing',
                'email_notify_buying',
            ]);
        });
    }
};
