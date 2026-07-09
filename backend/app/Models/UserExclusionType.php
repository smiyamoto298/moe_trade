<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * ユーザーごとのカスタム表示種別（アイテムボックス・DB保存時）。
 * 共通種別（exclusion_types・admin管理）とは別に、ユーザーが自分専用の種別を追加できる。
 * 台帳の全置換 PUT で name 単位に upsert される（id を保ち、種別タブ選択などの参照を安定させる）。
 */
class UserExclusionType extends Model
{
    protected $fillable = ['user_id', 'name', 'sort_order'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
