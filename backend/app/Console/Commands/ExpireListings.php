<?php

namespace App\Console\Commands;

use App\Models\Listing;
use Illuminate\Console\Command;

class ExpireListings extends Command
{
    protected $signature   = 'listings:expire';
    protected $description = '期限切れの出品を expired ステータスに変更する';

    public function handle(): int
    {
        $count = Listing::where('status', 'active')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);

        $this->info("期限切れ出品を {$count} 件取り下げました。");
        return 0;
    }
}
