<?php

namespace App\Support;

/**
 * メールアドレスのブラインドインデックス。
 *
 * 平文メールはDBに一切保存せず、ここで生成する決定的ハッシュ（HMAC-SHA256）
 * のみを users.email 列に格納する。決定的（同じ入力→同じ出力）なので、
 * ログイン認証・重複チェック・パスワード再設定時のユーザー検索に利用できる。
 *
 * 秘密鍵（ペッパー）は EMAIL_HASH_KEY。未設定時は APP_KEY をフォールバックに使う。
 * ペッパーは漏洩したハッシュ列からの総当たり（メールは推測されやすい）を防ぐため必須。
 */
class EmailHasher
{
    public static function hash(string $email): string
    {
        // 大文字小文字・前後空白の差異で別ハッシュにならないよう正規化してから計算する。
        $normalized = strtolower(trim($email));

        return hash_hmac('sha256', $normalized, self::key());
    }

    private static function key(): string
    {
        $key = config('app.email_hash_key') ?: config('app.key');

        if (empty($key)) {
            throw new \RuntimeException('EMAIL_HASH_KEY も APP_KEY も設定されていません。メールのハッシュ化に必要です。');
        }

        return (string) $key;
    }
}
