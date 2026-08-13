<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Web Push の購読情報（1行 = 1ブラウザの購読）。
 * 平文メール等の個人情報は持たず、プッシュサービスのエンドポイントと暗号化鍵のみを保存する。
 */
class PushSubscription extends Model
{
    protected $fillable = [
        'user_id',
        'endpoint',
        'public_key',
        'auth_token',
        'content_encoding',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
