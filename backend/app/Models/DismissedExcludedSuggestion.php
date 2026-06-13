<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 管理者が「共通除外にはしない」と却下したユーザー個別除外の候補名。
 * user-suggestions（共通除外への昇格候補）から除外するために使う。
 */
class DismissedExcludedSuggestion extends Model
{
    protected $fillable = ['name', 'dismissed_by'];

    public function dismisser()
    {
        return $this->belongsTo(User::class, 'dismissed_by');
    }
}
