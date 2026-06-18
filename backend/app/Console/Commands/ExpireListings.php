<?php

namespace App\Console\Commands;

use App\Models\BuyRequest;
use App\Models\Listing;

class ExpireListings extends BatchCommand
{
    protected $signature   = 'listings:expire';
    protected $description = '期限切れの出品・買取を expired ステータスに変更する';

    protected function runBatch(): string
    {
        $listings = Listing::where('status', 'active')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);

        $buyRequests = BuyRequest::where('status', 'active')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);

        return "期限切れ出品を {$listings} 件、買取を {$buyRequests} 件取り下げました。";
    }
}
