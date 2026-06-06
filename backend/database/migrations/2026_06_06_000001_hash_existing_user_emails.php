<?php

use App\Support\EmailHasher;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * 既存ユーザーの平文メールアドレスをブラインドインデックス（HMAC-SHA256）へ変換する。
 *
 * 以降、users.email にはハッシュのみが保存される。ハッシュは一方向のため
 * このマイグレーションは元に戻せない（down は何もしない）。
 */
return new class extends Migration
{
    public function up(): void
    {
        // '@' を含む行は未ハッシュ（平文）とみなして変換する。
        DB::table('users')
            ->where('email', 'like', '%@%')
            ->orderBy('id')
            ->each(function ($user) {
                DB::table('users')
                    ->where('id', $user->id)
                    ->update(['email' => EmailHasher::hash($user->email)]);
            });

        // 既存のパスワードリセットトークンは平文メールでキー付けされているため失効させる。
        DB::table('password_reset_tokens')->delete();
    }

    public function down(): void
    {
        // ハッシュは不可逆のため復元しない。
    }
};
