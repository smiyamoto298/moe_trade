<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// 期限切れお知らせの削除（毎日 6:00 JST）。
// ※ schedule:run を cron 登録している環境で有効。
//    コマンドを直接 cron 実行する環境では deploy/cron-purge-announcements.sh を使用。
Schedule::command('announcements:purge-expired')
    ->dailyAt('06:00')
    ->timezone('Asia/Tokyo');
