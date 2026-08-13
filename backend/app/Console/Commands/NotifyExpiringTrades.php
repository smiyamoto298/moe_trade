<?php

namespace App\Console\Commands;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Support\WebPushSender;

/**
 * 期限切れ前日の Web Push 通知。
 *
 * 期限まで24時間以内に入った active な出品・買取（即決/交渉可）の登録者へ、
 * 期限の延長を促すプッシュ通知を送る。毎時実行（listings:expire と同じ間隔）。
 * 送信済みは expiry_notified_at で管理し、期限が変わるまで再送しない
 * （期限変更時のリセットは Listing / BuyRequest モデルの saving フック）。
 * オークションは期限日に自動成立/取り下げされ延長もできないため対象外。
 */
class NotifyExpiringTrades extends BatchCommand
{
    protected $signature   = 'trades:notify-expiring';
    protected $description = '期限切れ前日（24時間以内）の出品・買取の登録者へ Web Push 通知する';

    protected function runBatch(): string
    {
        $push  = app(WebPushSender::class);
        $count = 0;

        $targets = [
            ['出品', '再出品', Listing::query()],
            ['買取', '再登録', BuyRequest::query()],
        ];

        foreach ($targets as [$label, $renewLabel, $query]) {
            $trades = $query->with('item:id,name')
                ->where('status', 'active')
                ->where('trade_type', '!=', 'auction')
                ->whereNull('expiry_notified_at')
                ->whereNotNull('expires_at')
                ->where('expires_at', '>', now())
                ->where('expires_at', '<=', now()->addDay())
                ->get();

            foreach ($trades as $trade) {
                $limit = $trade->expires_at->timezone('Asia/Tokyo')->format('n/j H:i');
                $push->send(
                    $trade->user_id,
                    'MoE Trade — まもなく期限切れ',
                    "{$label}「{$trade->item?->name}」は {$limit} に期限切れになります。継続する場合はマイ取引から期限を更新してください（期限切れ後も{$renewLabel}できます）。"
                );
                $trade->update(['expiry_notified_at' => now()]);
                $count++;
            }
        }

        return "期限切れ前日の通知を {$count} 件送信しました。";
    }
}
