<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 所持アイテム管理用の MoE アカウント名（取引用キャラクターとは別概念）。
 */
class MoeAccount extends Model
{
    protected $fillable = ['user_id', 'name', 'sort_order'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function ownedItems()
    {
        return $this->hasMany(OwnedItem::class);
    }
}
