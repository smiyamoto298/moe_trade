<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * ユーザーの所持アイテム台帳（DB保存時）。
 * 登録アイテム（items）と未紐づけ（item_id = null）でも保持できる。
 */
class OwnedItem extends Model
{
    protected $fillable = [
        'user_id', 'moe_account_id', 'item_id',
        'no', 'name', 'category', 'count', 'price',
        'is_worn', 'is_dyed', 'is_marked', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'count'      => 'integer',
            'price'      => 'integer',
            'is_worn'    => 'boolean',
            'is_dyed'    => 'boolean',
            'is_marked'  => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function moeAccount()
    {
        return $this->belongsTo(MoeAccount::class);
    }

    public function item()
    {
        return $this->belongsTo(Item::class);
    }
}
