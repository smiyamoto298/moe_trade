<?php

namespace App\Support;

/**
 * 本番データをローカルへ複製する際に、本番固有の個人情報（IPアドレス・
 * キャラクター名・ログイン情報など）を取り除くマスカー。
 *
 * マスキング後も「同じ元値 → 同じ値」「id で一意」を保ち、データの判別
 * （例: 同一IPからの複数アカウント検出、どの行がどのユーザーか）を可能にする。
 *
 * @see \App\Console\Commands\PullProdData
 */
class ProdDataMasker
{
    /** ローカル検証用の共通パスワード（全ユーザーにこのハッシュを入れる）。 */
    public const DEV_PASSWORD = 'password';

    private string $devPasswordHash;
    private string $salt;

    public function __construct(?string $devPasswordHash = null, ?string $salt = null)
    {
        // 共通パスワードのハッシュは1回だけ生成して全行で使い回す。
        $this->devPasswordHash = $devPasswordHash ?? bcrypt(self::DEV_PASSWORD);
        // IP マスクの決定性ソルト。ローカル専用なので APP_KEY を流用する。
        $this->salt = $salt ?? (string) (config('app.key') ?: 'moe-trade-mask');
    }

    /**
     * 1行分の本番データから本番固有情報を取り除く。
     * 対象テーブル以外はそのまま返す。
     */
    public function maskRow(string $table, array $row): array
    {
        switch ($table) {
            case 'users':
                // email 列はブラインドインデックス（ハッシュ）。ローカルの EMAIL_HASH_KEY で
                // dev 用アドレスをハッシュ化して入れることで user{id}@dev.local でログインできる。
                if (isset($row['id'])) {
                    $row['email'] = EmailHasher::hash($this->devEmail((int) $row['id']));
                }
                $row['password'] = $this->devPasswordHash;
                if (array_key_exists('register_ip', $row)) {
                    $row['register_ip'] = $this->maskIp($row['register_ip']);
                }
                if (array_key_exists('remember_token', $row)) {
                    $row['remember_token'] = null;
                }
                break;

            case 'user_characters':
                // キャラクター名は本番固有。id で一意な判別可能名に置換する。
                if (isset($row['id'])) {
                    $row['character_name'] = 'キャラ' . $row['id'];
                }
                break;

            case 'moe_accounts':
                // ゲームアカウント名も本番固有。id で一意な判別可能名に置換する。
                if (isset($row['id'])) {
                    $row['name'] = 'アカウント' . $row['id'];
                }
                break;

            case 'trade_history':
                if (array_key_exists('seller_ip', $row)) {
                    $row['seller_ip'] = $this->maskIp($row['seller_ip']);
                }
                if (array_key_exists('buyer_ip', $row)) {
                    $row['buyer_ip'] = $this->maskIp($row['buyer_ip']);
                }
                break;

            case 'trade_chats':
                if (array_key_exists('request_ip', $row)) {
                    $row['request_ip'] = $this->maskIp($row['request_ip']);
                }
                break;
        }

        return $row;
    }

    /** ローカルでのログイン用メールアドレス（このアドレス＋DEV_PASSWORD でログインできる）。 */
    public function devEmail(int $userId): string
    {
        return "user{$userId}@dev.local";
    }

    /**
     * IP を 10.x.y.z（プライベート空間）の決定的な値へ変換する。
     *
     * 元IPは復元できないが、同じ入力は常に同じ出力になるため
     * 「同一IPからの複数アカウント」などの判別はマスキング後も成立する。
     * null・空文字はそのまま返す（未記録のIPを判別可能なIPに変えない）。
     */
    public function maskIp(?string $ip): ?string
    {
        if ($ip === null || $ip === '') {
            return $ip;
        }

        $n = hexdec(substr(sha1($ip . '|' . $this->salt), 0, 6));

        return sprintf('10.%d.%d.%d', ($n >> 16) & 0xFF, ($n >> 8) & 0xFF, $n & 0xFF);
    }
}
