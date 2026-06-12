<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Models\TradeHistory;
use App\Support\PromoTweetComposer;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * X（旧Twitter）宣伝用ツイート文面の生成（admin限定）。
 *
 * 指定日（JST・省略時は当日）の「新規出品」「新規買取」「取引成立件数」を集計し、
 * 文字数制限内に分割済みのツイート文面一覧を返す。投稿自体は管理者が
 * Web Intent（https://x.com/intent/post）から手動で行う（X APIは使わない）。
 */
class PromoTweetController extends Controller
{
    private const TZ = 'Asia/Tokyo';

    public function index(Request $request)
    {
        // 単日（date）と期間累計（from〜to）の2モード。from/to はペアで指定する
        $data = $request->validate([
            'date' => 'nullable|date_format:Y-m-d',
            'from' => 'nullable|date_format:Y-m-d|required_with:to',
            'to'   => 'nullable|date_format:Y-m-d|required_with:from|after_or_equal:from',
        ]);

        $cumulative = isset($data['from'], $data['to']);

        if ($cumulative) {
            $from = CarbonImmutable::createFromFormat('Y-m-d', $data['from'], self::TZ)->startOfDay();
            $to   = CarbonImmutable::createFromFormat('Y-m-d', $data['to'], self::TZ)->startOfDay();
            $dateLabel = $from->format('n/j') . '〜' . $to->format('n/j');
        } else {
            $from = isset($data['date'])
                ? CarbonImmutable::createFromFormat('Y-m-d', $data['date'], self::TZ)->startOfDay()
                : CarbonImmutable::now(self::TZ)->startOfDay();
            $to   = $from;
            $dateLabel = $from->format('n/j');
        }

        // DBはUTC保存のため、JSTの日付範囲をUTCに変換して範囲検索する
        $start = $from->setTimezone('UTC');
        $end   = $to->addDay()->setTimezone('UTC');

        // 同一アイテム・同一価格の出品（一括出品由来など）は「×N」に集約する
        $listings = $this->aggregate(
            Listing::with('item:id,name')
                ->where('created_at', '>=', $start)
                ->where('created_at', '<', $end)
                ->where('status', '!=', 'cancelled') // 取り下げ済みは宣伝しない
                ->orderBy('created_at')
                ->get()
        );
        $buyRequests = $this->aggregate(
            BuyRequest::with('item:id,name')
                ->where('created_at', '>=', $start)
                ->where('created_at', '<', $end)
                ->where('status', '!=', 'cancelled')
                ->orderBy('created_at')
                ->get()
        );

        // 相場対象の有効な取引のみカウント（同一IP等の無効分は含めない）
        $tradeCount = TradeHistory::where('is_valid', true)
            ->where('traded_at', '>=', $start)
            ->where('traded_at', '<', $end)
            ->count();

        $siteUrl = rtrim(config('app.frontend_url'), '/') . '/listings';
        $tweets  = (new PromoTweetComposer())->compose(
            $dateLabel,
            $listings,
            $buyRequests,
            $tradeCount,
            $siteUrl,
            $cumulative
        );

        return response()->json([
            'mode'              => $cumulative ? 'range' : 'day',
            'date'              => $cumulative ? null : $from->format('Y-m-d'),
            'from'              => $from->format('Y-m-d'),
            'to'                => $to->format('Y-m-d'),
            'trade_count'       => $tradeCount,
            'listing_count'     => array_sum(array_column($listings, 'count')),
            'buy_request_count' => array_sum(array_column($buyRequests, 'count')),
            'tweets'            => array_map(fn (string $text) => [
                'text'   => $text,
                'length' => PromoTweetComposer::weightedLength($text),
                'limit'  => PromoTweetComposer::WEIGHT_LIMIT,
            ], $tweets),
        ]);
    }

    /**
     * アイテム名＋価格＋通貨が同じものを {name, price, currency, count} に集約する。
     *
     * @return array<int, array{name: string, price: int, currency: string, count: int}>
     */
    private function aggregate($rows): array
    {
        return $rows
            ->groupBy(fn ($row) => ($row->item?->name ?? '不明なアイテム') . '|' . $row->price . '|' . $row->currency)
            ->map(fn ($group) => [
                'name'     => $group->first()->item?->name ?? '不明なアイテム',
                'price'    => (int) $group->first()->price,
                'currency' => (string) $group->first()->currency,
                'count'    => $group->count(),
            ])
            ->values()
            ->all();
    }
}
