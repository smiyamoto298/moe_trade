<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * アクセス記録。(user_id, date=JST日付, hour=JSTの時) でユニーク。
 * RecordDailyAccess ミドルウェアが認証済みリクエスト時に upsert する。
 * 日次のユニークアクセスユーザー数は date ごとの user_id の重複排除、
 * 時間帯分布は hour ごとの行数（＝日ごと・時間帯ごとのユニークユーザーの延べ数）で求める。
 * hour が null なのは時間帯の記録を始める前に作られた古い行。
 */
class UserDailyAccess extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'date', 'hour'];

    protected $casts = ['hour' => 'integer'];
}
