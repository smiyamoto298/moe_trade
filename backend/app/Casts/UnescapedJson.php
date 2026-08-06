<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * JSON カラムを Unicode エスケープなし（JSON_UNESCAPED_UNICODE）で保存する配列キャスト。
 *
 * 標準の 'array' キャストは json_encode のデフォルトで日本語を \uXXXX にエスケープするため、
 * カラムに対する LIKE 検索（例: アイテムセットの set_items をアイテム名検索の対象にする）が
 * SQLite（テスト）で一致しない。MySQL の JSON 型は保存時に正規化されるため影響しないが、
 * 両環境で同じ SQL を成立させるために生 JSON を UTF-8 のまま保存する。
 */
class UnescapedJson implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        return $value === null ? null : json_decode($value, true);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        return $value === null ? null : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
