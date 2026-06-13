<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * ユーザーが自分で管理する個別の除外アイテム（DB保存時）。
 */
class UserExcludedItem extends Model
{
    protected $fillable = ['user_id', 'name'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
