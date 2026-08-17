<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * メール通知のための通知設定カラムを users に追加する。
 *
 * - notification_email: 通知の宛先。users.email は HMAC ハッシュ（復号不可）で
 *   送信に使えないため、通知を希望したユーザーだけ「復号可能な形」で別に持つ。
 *   平文ではなく Laravel の encrypted キャストで暗号化して保存する（APP_KEY が
 *   無ければ復号できない）。長さが伸びるため text。
 * - notification_email_verified_at: 確認メールのリンクが押された時刻。
 *   ログイン用アドレスと同一の場合は確認メールを送らないため null のままで、
 *   User::hasVerifiedNotificationEmail() がアカウントのメール認証で代替判定する。
 * - push_notify_* / email_notify_*: 通知種別（取引 / オークション / 期限切れ）ごとの
 *   チャネル別 ON/OFF。既定は全て ON（従来の Web Push の挙動を維持する）。
 *   メールは宛先が未設定・未確認なら送らないため、既定 ON でも勝手には届かない。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('notification_email')->nullable()->after('email');
            $table->timestamp('notification_email_verified_at')->nullable()->after('notification_email');

            $table->boolean('push_notify_trade')->default(true)->after('notification_email_verified_at');
            $table->boolean('push_notify_auction')->default(true)->after('push_notify_trade');
            $table->boolean('push_notify_expiry')->default(true)->after('push_notify_auction');

            $table->boolean('email_notify_trade')->default(true)->after('push_notify_expiry');
            $table->boolean('email_notify_auction')->default(true)->after('email_notify_trade');
            $table->boolean('email_notify_expiry')->default(true)->after('email_notify_auction');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'notification_email',
                'notification_email_verified_at',
                'push_notify_trade',
                'push_notify_auction',
                'push_notify_expiry',
                'email_notify_trade',
                'email_notify_auction',
                'email_notify_expiry',
            ]);
        });
    }
};
