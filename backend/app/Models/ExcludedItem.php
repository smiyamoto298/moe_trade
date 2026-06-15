<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 管理者が登録する共通の除外アイテム（アイテム名・文字列単位）。
 */
class ExcludedItem extends Model
{
    protected $fillable = ['name', 'created_by', 'exclusion_type_id'];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function type()
    {
        return $this->belongsTo(ExclusionType::class, 'exclusion_type_id');
    }
}
