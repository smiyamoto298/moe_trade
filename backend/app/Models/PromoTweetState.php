<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 宣伝ポストの状態（前回ツイート時刻）。常に1行のみを使う（id=1）。
 */
class PromoTweetState extends Model
{
    protected $table = 'promo_tweet_states';

    protected $fillable = ['last_posted_at'];

    protected function casts(): array
    {
        return [
            'last_posted_at' => 'datetime',
        ];
    }

    /** 唯一の状態行を取得（無ければ作成）する。 */
    public static function current(): self
    {
        return static::firstOrCreate(['id' => 1]);
    }
}
