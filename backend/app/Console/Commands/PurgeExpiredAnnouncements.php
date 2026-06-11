<?php

namespace App\Console\Commands;

use App\Models\Announcement;
use Illuminate\Console\Command;

class PurgeExpiredAnnouncements extends Command
{
    protected $signature   = 'announcements:purge-expired';
    protected $description = '表示期限が切れたお知らせを削除する（日次バッチ）';

    public function handle(): int
    {
        $deleted = Announcement::whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->delete();

        $this->info("期限切れのお知らせを {$deleted} 件削除しました。");
        return 0;
    }
}
