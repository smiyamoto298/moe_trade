<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 共通除外アイテムの種別（カテゴリ）。管理者が任意で追加できる。
 * 既定種別「その他」（is_default=true）は削除できない（改名は可）。
 * default_enabled は「まだ設定をいじっていないユーザーに既定で適用するか（デフォルトON/OFF）」。
 */
class ExclusionType extends Model
{
    protected $fillable = ['name', 'is_default', 'default_enabled', 'sort_order'];

    protected $casts = [
        'is_default'      => 'boolean',
        'default_enabled' => 'boolean',
    ];

    public function items()
    {
        return $this->hasMany(ExcludedItem::class);
    }

    /** 既定種別（その他）。種別未指定の除外アイテムの受け皿。 */
    public static function default(): ?self
    {
        return static::where('is_default', true)->first();
    }
}
