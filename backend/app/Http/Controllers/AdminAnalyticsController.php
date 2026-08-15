<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Models\TradeHistory;
use App\Models\UserDailyAccess;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class AdminAnalyticsController extends Controller
{
    // 集計はJST（日本時間）の日付単位で行う。DBの日時はUTC保存。
    private const TZ = 'Asia/Tokyo';

    /**
     * 利用状況の日次集計（editor / admin）。
     * 出品数・買取数は作成ベース（後に取り下げ・期限切れになったものも含む）、
     * 取引成立数は trade_history の相場対象（is_valid=true）のみ（宣伝ポストと同じ流儀）。
     * 成立は出品由来（listing_trades）と買取由来（buy_request_trades・buy_request_id あり）に分けて返す。
     * registrations（登録=listings+buy_requests）と trades（成立=listing_trades+buy_request_trades）の合算系列も返す。
     * trade_users は期間内の成立取引に売り手・買い手として関わったユニークユーザー数。
     * active_users は日ごとのユニークアクセスユーザー数（user_daily_accesses・RecordDailyAccess が記録）。
     * totals.active_users は期間内に1回でもアクセスしたユニークユーザー数（日ごとの単純合算ではない）。
     * hourly は期間内の全データを日付を無視して JST の時刻（0〜23時）で束ねた分布。
     * アクセスは日付単位でしか記録していないため hourly には含まない。
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
        $listingTimes    = Listing::where('created_at', '>=', $startUtc)->pluck('created_at');
        $buyRequestTimes = BuyRequest::where('created_at', '>=', $startUtc)->pluck('created_at');

        $listings    = $this->countByDay($listingTimes);
        $buyRequests = $this->countByDay($buyRequestTimes);

        $trades = TradeHistory::where('is_valid', true)
            ->where('traded_at', '>=', $startUtc)
            ->get(['traded_at', 'buy_request_id', 'seller_id', 'buyer_id']);

        $listingTradeTimes    = $trades->whereNull('buy_request_id')->pluck('traded_at');
        $buyRequestTradeTimes = $trades->whereNotNull('buy_request_id')->pluck('traded_at');

        $listingTrades    = $this->countByDay($listingTradeTimes);
        $buyRequestTrades = $this->countByDay($buyRequestTradeTimes);

        // 売り手・買い手の両方を重複なく数える（buyer_id は旧データで null があり得る）
        $tradeUsers = $trades->pluck('seller_id')
            ->merge($trades->pluck('buyer_id'))
            ->filter()
            ->unique()
            ->count();

        // 日次ユニークアクセス。date は JST 日付で保存済みなのでタイムゾーン変換不要。
        // (user_id, date) ユニークのため日付ごとの行数がそのままユニークユーザー数になる
        $accesses = UserDailyAccess::where('date', '>=', $from->format('Y-m-d'))
            ->get(['user_id', 'date']);
        $activeUsers = $accesses
            ->countBy(fn ($a) => CarbonImmutable::parse($a->date)->format('Y-m-d'))
            ->all();
        $activeUsersTotal = $accesses->pluck('user_id')->unique()->count();

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
                'active_users'       => $activeUsers[$key] ?? 0,
            ];
        }

        // 時間帯分布。日付をまたいでも同じ時刻（JST）なら同一時間としてまとめる
        $listingsByHour     = $this->countByHour($listingTimes);
        $buyRequestsByHour  = $this->countByHour($buyRequestTimes);
        $listingTradesHour  = $this->countByHour($listingTradeTimes);
        $buyRequestTradeHr  = $this->countByHour($buyRequestTradeTimes);

        // 0〜23時を必ず全て返す（グラフの欠損時間を作らない）
        $hourly = [];
        for ($h = 0; $h < 24; $h++) {
            $hourly[] = [
                'hour'               => $h,
                'listings'           => $listingsByHour[$h] ?? 0,
                'buy_requests'       => $buyRequestsByHour[$h] ?? 0,
                'registrations'      => ($listingsByHour[$h] ?? 0) + ($buyRequestsByHour[$h] ?? 0),
                'listing_trades'     => $listingTradesHour[$h] ?? 0,
                'buy_request_trades' => $buyRequestTradeHr[$h] ?? 0,
                'trades'             => ($listingTradesHour[$h] ?? 0) + ($buyRequestTradeHr[$h] ?? 0),
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
                'active_users'       => $activeUsersTotal,
            ],
            'daily'  => $daily,
            'hourly' => $hourly,
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

    /**
     * UTC日時のコレクションを JST の時刻（0〜23）ごとの件数に集計する。日付は無視するため、
     * 別の日でも同じ時刻なら同一キーにまとまる。
     */
    private function countByHour($timestamps): array
    {
        $counts = [];
        foreach ($timestamps as $ts) {
            $hour = (int) CarbonImmutable::parse($ts)->setTimezone(self::TZ)->format('G');
            $counts[$hour] = ($counts[$hour] ?? 0) + 1;
        }

        return $counts;
    }
}
