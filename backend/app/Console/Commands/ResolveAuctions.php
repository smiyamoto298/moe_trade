<?php

namespace App\Console\Commands;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Support\Auction;

/**
 * 期限が到来したオークションを解決する（15分ごとに実行）。
 *
 * - open 入札あり → 最良入札（出品=最高 / 買取=最安）を自動的に取引成立にする。
 * - 入札なし     → expired（自動取り下げ。再出品はしない）。
 *
 * 通常の即決/交渉可の期限切れは listings:expire（毎時）が担当する。
 */
class ResolveAuctions extends BatchCommand
{
    protected $signature   = 'auctions:resolve';
    protected $description = '期限が到来したオークションを自動成立／取り下げする（入札があれば取引成立）';

    protected function runBatch(): string
    {
        $expired = Listing::where('status', 'active')
            ->where('trade_type', 'auction')
            ->where('expires_at', '<', now())
            ->get()
            ->concat(
                BuyRequest::where('status', 'active')
                    ->where('trade_type', 'auction')
                    ->where('expires_at', '<', now())
                    ->get()
            );

        $dealt = 0;
        $withdrawn = 0;
        foreach ($expired as $source) {
            $hadBid = Auction::bidCount($source) > 0;
            Auction::resolveExpired($source);
            $hadBid ? $dealt++ : $withdrawn++;
        }

        return "オークションを {$dealt} 件成立・{$withdrawn} 件取り下げました。";
    }
}
