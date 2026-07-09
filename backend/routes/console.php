<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// 期限切れお知らせの削除（毎日 6:00 JST）。
// ※ schedule:run を cron 登録している環境で有効。
//    コマンドを直接 cron 実行する環境では cron 用ラッパー（非公開の運用スクリプト）を使用。
Schedule::command('announcements:purge-expired')
    ->dailyAt('06:00')
    ->timezone('Asia/Tokyo');

// 期限切れ出品・買取の自動取り下げ（毎時）。
// 公開クエリ側（visible スコープ）でも期限切れは除外しているため、これが遅延しても
// 一覧・詳細に期限切れは出ないが、本バッチで status を expired に揃えることで
// マイページの管理表示・再出品（renew）導線を正しくする。
// ※ schedule:run を cron 登録している環境で有効。
//    コマンドを直接 cron 実行する環境では cron 用ラッパー（非公開の運用スクリプト）を使用。
Schedule::command('listings:expire')
    ->hourly()
    ->timezone('Asia/Tokyo');

// オークションの自動成立／取り下げ（15分ごと）。
// 期限日は 15 分単位に丸めて登録されるため（App\Support\Auction::roundDeadline）、
// 締切到来後ほぼ遅延なく最良入札で取引成立／入札なしで取り下げになる。
// ※ schedule:run を cron 登録している環境で有効。
//    コマンドを直接 cron 実行する環境では cron 用ラッパー（非公開の運用スクリプト）を使用。
Schedule::command('auctions:resolve')
    ->everyFifteenMinutes()
    ->timezone('Asia/Tokyo');
