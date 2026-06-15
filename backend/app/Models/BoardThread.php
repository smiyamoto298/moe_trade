<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BoardThread extends Model
{
    protected $fillable = ['user_id', 'title', 'status', 'category', 'admin_only'];

    /** スレッド種別のホワイトリスト（キー => 表示名） */
    public const CATEGORIES = [
        'item_correction' => 'アイテム情報修正依頼',
        'request'         => '要望',
        'bug'             => '不具合',
        'other'           => 'その他',
    ];

    protected $casts = [
        'admin_only' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function posts()
    {
        return $this->hasMany(BoardPost::class, 'thread_id')->orderBy('created_at');
    }
}
