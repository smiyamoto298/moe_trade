<?php

namespace App\Support;

/**
 * 通知の種別。
 *
 * ユーザーはこの種別ごとに、Web Push / メールそれぞれの ON・OFF を設定できる。
 * users テーブルの `push_notify_<種別>` / `email_notify_<種別>` 列と対応する。
 *
 * 種別を増やすときは、ここへの追加 + users への列追加（マイグレーション）+
 * 設定画面の項目追加が必要。
 */
class NotificationCategory
{
    /** 取引: 新しい取引希望・新着メッセージ・取引成立・見送り */
    public const TRADE = 'trade';

    /** オークション: 入札あり・価格更新（outbid）・落札/落選・成立/不成立 */
    public const AUCTION = 'auction';

    /** 期限切れ: 期限切れ前日のリマインド */
    public const EXPIRY = 'expiry';

    /** 新規出品: 誰かが新しく出品したとき（全出品が対象のため既定OFF） */
    public const LISTING = 'listing';

    /** 新規買取: 誰かが新しく買取を登録したとき（全買取が対象のため既定OFF） */
    public const BUYING = 'buying';

    /** @return list<string> */
    public static function all(): array
    {
        return [self::TRADE, self::AUCTION, self::EXPIRY, self::LISTING, self::BUYING];
    }

    public static function isValid(string $category): bool
    {
        return in_array($category, self::all(), true);
    }

    /** 設定画面・ログ用の日本語ラベル。 */
    public static function label(string $category): string
    {
        return match ($category) {
            self::TRADE   => '取引',
            self::AUCTION => 'オークション',
            self::EXPIRY  => '期限切れ',
            self::LISTING => '新規出品',
            self::BUYING  => '新規買取',
            default       => $category,
        };
    }
}
