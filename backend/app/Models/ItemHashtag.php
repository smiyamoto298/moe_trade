<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * アイテムのハッシュタグ（[[Item]] の hasMany）。
 * is_fixed=true は admin/editor 管理の固定タグでユーザー削除不可。
 */
class ItemHashtag extends Model
{
    protected $fillable = ['item_id', 'tag', 'is_fixed', 'created_by'];

    protected function casts(): array
    {
        return [
            'is_fixed' => 'boolean',
        ];
    }

    public function item()
    {
        return $this->belongsTo(Item::class);
    }

    /**
     * 入力されたタグ文字列を正規化する。
     * 先頭の # / ＃ を除去し、前後・連続する空白を畳んで trim する。
     */
    public static function normalize(?string $raw): string
    {
        $tag = trim((string) $raw);
        // 先頭のハッシュ記号（半角・全角）を除去
        $tag = preg_replace('/^[#＃]+/u', '', $tag);
        // 連続する空白を1つに畳む
        $tag = preg_replace('/\s+/u', ' ', $tag);
        return trim($tag);
    }

    /**
     * 指定種別（固定 or 通常）のタグをまとめて入れ替える。
     * 反対種別のタグには触れない（固定設定はユーザータグを残し、通常設定は固定タグを残す）。
     *
     * - 固定設定（$isFixed=true）: 同名の通常タグがあれば固定へ昇格する
     * - 通常設定（$isFixed=false）: 同名の固定タグがあればそれを尊重して新規作成しない
     *
     * @param string[] $tags 入力タグ（# 付き・大文字小文字の揺れ・重複可）
     */
    public static function replaceForItem(Item $item, array $tags, bool $isFixed, ?int $userId = null): void
    {
        // 正規化＋大文字小文字を無視した重複排除（表示はオリジナルの綴りを保持）
        $normalized = [];
        foreach ($tags as $raw) {
            $tag = self::normalize(is_string($raw) ? $raw : '');
            if ($tag === '' || mb_strlen($tag) > 50) {
                continue;
            }
            $normalized[mb_strtolower($tag)] = $tag;
        }

        // 同種別の既存タグを一旦すべて削除
        $item->hashtags()->where('is_fixed', $isFixed)->delete();

        foreach ($normalized as $lower => $tag) {
            // 反対種別に同名タグがある場合の扱い（unique(item_id, tag) 衝突回避）
            $other = $item->hashtags()->whereRaw('LOWER(tag) = ?', [$lower])->first();
            if ($other) {
                // 固定設定なら同名の通常タグを固定へ昇格。通常設定なら固定タグは尊重して何もしない。
                if ($isFixed) {
                    $other->update(['is_fixed' => true]);
                }
                continue;
            }
            $item->hashtags()->create([
                'tag'        => $tag,
                'is_fixed'   => $isFixed,
                'created_by' => $isFixed ? null : $userId,
            ]);
        }
    }
}
