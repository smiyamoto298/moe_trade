<?php

namespace App\Support;

/**
 * 追加効果（base_stats）の数値パラメータキー一覧。
 * フロントの BASE_STAT_LABELS（utils/constants.ts）のキーと完全一致させること。
 *
 * 一覧検索の絞り込み・ソートでは、リクエストで渡されたキーを JSON_EXTRACT のパスへ
 * 文字列として埋め込む（バインドできない）。キーをこのホワイトリストで検証し、
 * 任意文字列の混入（SQLインジェクション）を防ぐために使う。
 */
class Stats
{
    public const KEYS = [
        'atk', 'mag', 'def', 'atk_delay', 'mag_delay',
        'max_hp', 'max_st', 'max_mp', 'hit', 'eva',
        'res_fire', 'res_earth', 'res_water', 'res_wind', 'res_none',
        'max_weight', 'move_speed', 'swim_speed',
    ];

    /** 既知の base_stats キーかどうか。 */
    public static function isValidKey(string $key): bool
    {
        return in_array($key, self::KEYS, true);
    }
}
