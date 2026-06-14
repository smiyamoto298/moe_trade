<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BinderLabel extends Model
{
    public $timestamps = false;

    protected $fillable = ['label', 'sort_order'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    /**
     * レシピの「バインダー」名が候補テーブルに無ければ末尾に追加する。
     * アイテム登録・更新時に呼び出し、新しいバインダー名を自動で候補化する。
     */
    public static function syncFromBinder(?string $binder): void
    {
        $label = trim((string) $binder);
        // label カラムは最大100文字。空文字や超過するものは候補化しない。
        if ($label === '' || mb_strlen($label) > 100) {
            return;
        }

        if (static::where('label', $label)->exists()) {
            return;
        }

        $order = (int) (static::max('sort_order') ?? -1) + 1;
        // 競合（同時登録）を考慮し、重複は無視して挿入
        static::insertOrIgnore([['label' => $label, 'sort_order' => $order]]);
    }
}
