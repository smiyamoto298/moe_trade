<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 日ごとのユニークアクセス記録。(user_id, date=JST日付) でユニーク。
 * RecordDailyAccess ミドルウェアが認証済みリクエスト時に upsert する。
 */
class UserDailyAccess extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'date'];
}
