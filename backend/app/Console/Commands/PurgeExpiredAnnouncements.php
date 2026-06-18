<?php

namespace App\Console\Commands;

use App\Models\Announcement;

class PurgeExpiredAnnouncements extends BatchCommand
{
    protected $signature   = 'announcements:purge-expired';
    protected $description = '表示期限が切れたお知らせを削除する（日次バッチ）';

    protected function runBatch(): string
    {
        $deleted = Announcement::whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->delete();

        return "期限切れのお知らせを {$deleted} 件削除しました。";
    }
}
