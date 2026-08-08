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
     * 成立は出品由来（listing_trades）と買取由来（buy_request_trades・buy_request_id あり）に分けて返す。
     * registrations（登録=listings+buy_requests）と trades（成立=listing_trades+buy_request_trades）の合算系列も返す。
     * trade_users は期間内の成立取引に売り手・買い手として関わったユニークユーザー数。
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

        $trades = TradeHistory::where('is_valid', true)
            ->where('traded_at', '>=', $startUtc)
            ->get(['traded_at', 'buy_request_id', 'seller_id', 'buyer_id']);

        $listingTrades    = $this->countByDay($trades->whereNull('buy_request_id')->pluck('traded_at'));
        $buyRequestTrades = $this->countByDay($trades->whereNotNull('buy_request_id')->pluck('traded_at'));

        // 売り手・買い手の両方を重複なく数える（buyer_id は旧データで null があり得る）
        $tradeUsers = $trades->pluck('seller_id')
            ->merge($trades->pluck('buyer_id'))
            ->filter()
            ->unique()
            ->count();

        // 期間内の全日をゼロ埋めして返す（グラフの欠損日を作らない）
        $daily = [];
        for ($d = $from; $d->lte($today); $d = $d->addDay()) {
            $key     = $d->format('Y-m-d');
            $daily[] = [
                'date'               => $key,
                'listings'           => $listings[$key] ?? 0,
                'buy_requests'       => $buyRequests[$key] ?? 0,
                'registrations'      => ($listings[$key] ?? 0) + ($buyRequests[$key] ?? 0),
                'listing_trades'     => $listingTrades[$key] ?? 0,
                'buy_request_trades' => $buyRequestTrades[$key] ?? 0,
                'trades'             => ($listingTrades[$key] ?? 0) + ($buyRequestTrades[$key] ?? 0),
            ];
        }

        return response()->json([
            'days'   => $days,
            'from'   => $from->format('Y-m-d'),
            'to'     => $today->format('Y-m-d'),
            'totals' => [
                'listings'           => array_sum(array_column($daily, 'listings')),
                'buy_requests'       => array_sum(array_column($daily, 'buy_requests')),
                'registrations'      => array_sum(array_column($daily, 'registrations')),
                'listing_trades'     => array_sum(array_column($daily, 'listing_trades')),
                'buy_request_trades' => array_sum(array_column($daily, 'buy_request_trades')),
                'trades'             => array_sum(array_column($daily, 'trades')),
                'trade_users'        => $tradeUsers,
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
