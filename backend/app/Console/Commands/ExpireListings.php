<?php

namespace App\Console\Commands;

use App\Models\BuyRequest;
use App\Models\Listing;

class ExpireListings extends BatchCommand
{
    protected $signature   = 'listings:expire';
    protected $description = '期限切れの出品・買取（即決/交渉可）を expired ステータスに変更する';

    protected function runBatch(): string
    {
        // 通常（即決・交渉可）の期限切れを expired に。
        // オークションは期限日に自動成立/取り下げするため対象外（auctions:resolve が担当）。
        $listings = Listing::where('status', 'active')
            ->where('trade_type', '!=', 'auction')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);

        $buyRequests = BuyRequest::where('status', 'active')
            ->where('trade_type', '!=', 'auction')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);

        return "期限切れ出品を {$listings} 件、買取を {$buyRequests} 件取り下げました。";
    }
}
