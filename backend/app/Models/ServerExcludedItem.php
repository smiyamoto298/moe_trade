<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 「サーバ登録対象外」のシステム共通アイテム名（管理者が登録）。
 * ここに登録された名前は、保存先がサーバー（DB）でもクライアントのローカルストレージにだけ保存する。
 */
class ServerExcludedItem extends Model
{
    protected $fillable = ['name', 'created_by'];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
