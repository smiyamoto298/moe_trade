<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 端末（ローカルストレージ）保存ユーザーが除外したアイテム名の匿名報告。
 * 共通除外（excluded_items）への昇格候補に、DB保存分（user_excluded_items）と
 * マージして表示する。誰が除外したかは持たない（名前のみ・一意）。
 */
class ReportedExcludedName extends Model
{
    protected $fillable = ['name'];
}
