<?php

namespace App\Support;

use App\Models\BuyRequest;
use App\Models\Listing;

/**
 * 取引（出品・買取）を「新着扱い」にすべき変更かどうかの判定。
 *
 * 期限切れの再出品・再登録で、買い手にとって有利になる変更——「値下げ」または
 * 「即決(fixed)→交渉可(negotiable)」——があった場合に、その取引を新規出品と同等に
 * 新着順の先頭へ出し、宣伝ツイートの対象にも含める（bumped_at を更新する）。
 *
 * 価格の据え置き・値上げ、交渉可→即決への変更は対象外（新着扱いにしない）。
 */
class TradeFreshness
{
    /**
     * @param  Listing|BuyRequest  $current  変更前のレコード
     * @param  array<string, mixed>  $data    renew で受け取った検証済みの変更内容（price / trade_type は任意）
     */
    public static function isAttractiveChange(Listing|BuyRequest $current, array $data): bool
    {
        // 値下げ（明示的に price が渡され、現在価格より低い）
        if (array_key_exists('price', $data) && (int) $data['price'] < (int) $current->price) {
            return true;
        }
        // 即決 → 交渉可
        if (
            array_key_exists('trade_type', $data)
            && $current->trade_type === 'fixed'
            && $data['trade_type'] === 'negotiable'
        ) {
            return true;
        }
        return false;
    }
}
