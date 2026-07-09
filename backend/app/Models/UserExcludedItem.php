<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * ユーザーが自分で分類したアイテム名→種別の割当（DB保存時）。
 * 「除外」から「表示種別（ジャンル）」へ概念転換したもの。exclusion_type_id が null の行は
 * 既定種別「その他」とみなす。
 */
class UserExcludedItem extends Model
{
    protected $fillable = ['user_id', 'name', 'exclusion_type_id', 'user_exclusion_type_id'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function type()
    {
        return $this->belongsTo(ExclusionType::class, 'exclusion_type_id');
    }

    /** ユーザーのカスタム種別への割当（設定時は共通種別 exclusion_type_id より優先）。 */
    public function customType()
    {
        return $this->belongsTo(UserExclusionType::class, 'user_exclusion_type_id');
    }
}
