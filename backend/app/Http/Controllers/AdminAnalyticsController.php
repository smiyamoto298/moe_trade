<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Models\TradeHistory;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class AdminAnalyticsController extends Controller
{
    // 集計はJST（日本時間）の日付単位で行う。DBの日時はUTC保存。
    private const TZ = 'Asia/Tokyo';

    /**
     * 利用状況の日次集計（admin限定）。
     * 出品数・買取数は作成ベース（後に取り下げ・期限切れになったものも含む）、
     * 取引成立数は trade_history の相場対象（is_valid=true）のみ（宣伝ポストと同じ流儀）。
     */
    public function usage(Request $request)
    {
        $data = $request->validate([
            'days' => ['sometimes', 'integer', 'min:1', 'max:365'],
        ]);
        $days = (int) ($data['days'] ?? 30);

        $today    = CarbonImmutable::now(self::TZ)->startOfDay();
        $from     = $today->subDays($days - 1);
        $startUtc = $from->setTimezone('UTC');

        // DATE() 等のDB方言に依存しないよう、UTCの日時をPHP側でJST日付に丸めて集計する
        $listings    = $this->countByDay(Listing::where('created_at', '>=', $startUtc)->pluck('created_at'));
        $buyRequests = $this->countByDay(BuyRequest::where('created_at', '>=', $startUtc)->pluck('created_at'));
        $trades      = $this->countByDay(
            TradeHistory::where('is_valid', true)->where('traded_at', '>=', $startUtc)->pluck('traded_at')
        );

        // 期間内の全日をゼロ埋めして返す（グラフの欠損日を作らない）
        $daily = [];
        for ($d = $from; $d->lte($today); $d = $d->addDay()) {
            $key     = $d->format('Y-m-d');
            $daily[] = [
                'date'         => $key,
                'listings'     => $listings[$key] ?? 0,
                'buy_requests' => $buyRequests[$key] ?? 0,
                'trades'       => $trades[$key] ?? 0,
            ];
        }

        return response()->json([
            'days'   => $days,
            'from'   => $from->format('Y-m-d'),
            'to'     => $today->format('Y-m-d'),
            'totals' => [
                'listings'     => array_sum(array_column($daily, 'listings')),
                'buy_requests' => array_sum(array_column($daily, 'buy_requests')),
                'trades'       => array_sum(array_column($daily, 'trades')),
            ],
            'daily'  => $daily,
        ]);
    }

    /**
     * UTC日時のコレクションを JST の日付キー（Y-m-d）ごとの件数に集計する。
     */
    private function countByDay($timestamps): array
    {
        $counts = [];
        foreach ($timestamps as $ts) {
            $key = CarbonImmutable::parse($ts)->setTimezone(self::TZ)->format('Y-m-d');
            $counts[$key] = ($counts[$key] ?? 0) + 1;
        }

        return $counts;
    }
}
