<?php

namespace App\Console\Commands;

use App\Models\BuyRequest;
use App\Models\Listing;
use Illuminate\Console\Command;

class ExpireListings extends Command
{
    protected $signature   = 'listings:expire';
    protected $description = '期限切れの出品・買取を expired ステータスに変更する';

    public function handle(): int
    {
        $listings = Listing::where('status', 'active')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);

        $buyRequests = BuyRequest::where('status', 'active')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);

        $this->info("期限切れ出品を {$listings} 件、買取を {$buyRequests} 件取り下げました。");
        return 0;
    }
}
