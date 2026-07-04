<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Models\PromoTweetState;
use App\Models\TradeHistory;
use App\Support\Auction;
use App\Support\PromoTweetComposer;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * X（旧Twitter）宣伝用ツイート文面の生成（admin限定）。
 *
 * 単日モードは「前回ツイート時刻（since・省略時は記録済みの last_posted_at、無ければ当日0:00）」
 * から現在までの「新規出品」「新規買取」「取引成立件数」を集計する。期間累計モードは from〜to の
 * 日付範囲で集計する。文字数制限内に分割済みのツイート文面一覧を返す。
 * 投稿自体は管理者が Web Intent（https://x.com/intent/post）から手動で行う（X APIは使わない）。
 * 「Xでポスト」押下時に posted() を呼び、last_posted_at を現在時刻で更新する。
 */
class PromoTweetController extends Controller
{
    private const TZ = 'Asia/Tokyo';

    public function index(Request $request)
    {
        // 単日（since〜現在）と期間累計（from〜to）の2モード。from/to はペアで指定する
        $data = $request->validate([
            'since' => 'nullable|date',
            'from'  => 'nullable|date_format:Y-m-d|required_with:to',
            'to'    => 'nullable|date_format:Y-m-d|required_with:from|after_or_equal:from',
        ]);

        $cumulative = isset($data['from'], $data['to']);
        $now        = CarbonImmutable::now(self::TZ);
        $lastPosted = PromoTweetState::current()->last_posted_at;

        if ($cumulative) {
            $from  = CarbonImmutable::createFromFormat('Y-m-d', $data['from'], self::TZ)->startOfDay();
            $to    = CarbonImmutable::createFromFormat('Y-m-d', $data['to'], self::TZ)->startOfDay();
            $start = $from->setTimezone('UTC');
            $end   = $to->addDay()->setTimezone('UTC');
            $dateLabel = $from->format('n/j') . '〜' . $to->format('n/j');
        } else {
            // 前回ツイート時刻（指定があれば優先・無ければ記録値・それも無ければ当日0:00）から現在まで
            $since = isset($data['since'])
                ? CarbonImmutable::parse($data['since'], self::TZ)
                : ($lastPosted?->setTimezone(self::TZ) ?? $now->startOfDay());
            $start = $since->setTimezone('UTC');
            $end   = $now->setTimezone('UTC');
            $dateLabel = $now->format('n/j');
        }

        // 期間累計の上限は翌日0:00なので排他（<）、単日の上限は「現在」なので包含（<=）
        $endOp = $cumulative ? '<' : '<=';

        // 「新着扱い」(bumped_at)＝値下げ/即決→交渉可で再出品・入札で現在価格が更新された取引も宣伝対象に含める。
        // bumped_at 未設定の通常出品は created_at と同じ挙動。$endOp は '<' / '<=' の固定値（ユーザー入力ではない）。
        $freshness = 'COALESCE(bumped_at, created_at)';
        $listingRows = Listing::with('item:id,name')
            ->whereRaw("$freshness >= ?", [$start])
            ->whereRaw("$freshness $endOp ?", [$end])
            ->where('status', '!=', 'cancelled') // 取り下げ済みは宣伝しない
            ->orderByRaw($freshness)
            ->get();
        $buyRequestRows = BuyRequest::with('item:id,name')
            ->whereRaw("$freshness >= ?", [$start])
            ->whereRaw("$freshness $endOp ?", [$end])
            ->where('status', '!=', 'cancelled')
            ->orderByRaw($freshness)
            ->get();

        // オークションは【新規の取引】ではなく【オークション現在価格】に現在価格で載せる。
        // 終了済み（completed/expired）のオークションに「現在価格」は無いので進行中（active）のみ対象。
        // 同一アイテム・同一価格の出品（一括出品由来など）は「×N」に集約する
        $listings           = $this->aggregate($listingRows->reject(fn ($row) => $row->isAuction()));
        $buyRequests        = $this->aggregate($buyRequestRows->reject(fn ($row) => $row->isAuction()));
        $auctionListings    = $this->aggregateAuctions($listingRows->filter(fn ($row) => $row->isAuction()));
        $auctionBuyRequests = $this->aggregateAuctions($buyRequestRows->filter(fn ($row) => $row->isAuction()));

        // 相場対象の有効な取引のみカウント（同一IP等の無効分は含めない）
        $tradeCount = TradeHistory::where('is_valid', true)
            ->where('traded_at', '>=', $start)
            ->where('traded_at', $endOp, $end)
            ->count();

        // 現在有効な出品・買取の登録総数（公開一覧と同じ条件: active かつ非凍結ユーザー）
        $activeListingCount = Listing::where('status', 'active')
            ->whereHas('user', fn ($q) => $q->where('is_suspended', false))
            ->count();
        $activeBuyRequestCount = BuyRequest::where('status', 'active')
            ->whereHas('user', fn ($q) => $q->where('is_suspended', false))
            ->count();

        $siteUrl = rtrim(config('app.frontend_url'), '/') . '/listings';
        $tweets  = (new PromoTweetComposer())->compose(
            $dateLabel,
            $listings,
            $buyRequests,
            $auctionListings,
            $auctionBuyRequests,
            $tradeCount,
            $activeListingCount,
            $activeBuyRequestCount,
            $siteUrl,
            $cumulative
        );

        // 日時はフロントの datetime-local 入力にそのまま入る JST の "Y-m-d\TH:i" で返す
        return response()->json([
            'mode'              => $cumulative ? 'range' : 'day',
            // 単日モード: 集計の開始/終了と、記録済みの前回ツイート時刻
            'since'             => $cumulative ? null : $start->setTimezone(self::TZ)->format('Y-m-d\TH:i'),
            'until'             => $cumulative ? null : $now->format('Y-m-d\TH:i'),
            'last_posted_at'    => $lastPosted?->setTimezone(self::TZ)->format('Y-m-d\TH:i'),
            // 期間累計モード: 日付範囲
            'from'              => $cumulative ? $from->format('Y-m-d') : null,
            'to'                => $cumulative ? $to->format('Y-m-d') : null,
            'trade_count'       => $tradeCount,
            'listing_count'     => array_sum(array_column($listings, 'count')),
            'buy_request_count' => array_sum(array_column($buyRequests, 'count')),
            'auction_count'     => array_sum(array_column($auctionListings, 'count'))
                + array_sum(array_column($auctionBuyRequests, 'count')),
            'tweets'            => array_map(fn (string $text) => [
                'text'   => $text,
                'length' => PromoTweetComposer::weightedLength($text),
                'limit'  => PromoTweetComposer::WEIGHT_LIMIT,
            ], $tweets),
        ]);
    }

    /**
     * 「Xでポスト」押下時に呼ばれ、前回ツイート時刻を現在時刻で記録する。
     * 次回の単日モードはこの時刻からの集計になる。
     */
    public function posted()
    {
        $state = PromoTweetState::current();
        $state->last_posted_at = CarbonImmutable::now('UTC');
        $state->save();

        return response()->json([
            'last_posted_at' => $state->last_posted_at->setTimezone(self::TZ)->format('Y-m-d\TH:i'),
        ]);
    }

    /**
     * アイテム名＋価格＋通貨＋取引方法が同じものを
     * {name, price, currency, count, negotiable} に集約する。
     * 取引方法（即決/交渉可）が違うものは別行として扱う。
     *
     * @return array<int, array{name: string, price: int, currency: string, count: int, negotiable: bool}>
     */
    private function aggregate($rows): array
    {
        return $rows
            ->groupBy(fn ($row) => ($row->item?->name ?? '不明なアイテム') . '|' . $row->price . '|' . $row->currency . '|' . $row->trade_type)
            ->map(fn ($group) => [
                'name'       => $group->first()->item?->name ?? '不明なアイテム',
                'price'      => (int) $group->first()->price,
                'currency'   => (string) $group->first()->currency,
                'count'      => $group->count(),
                'negotiable' => $group->first()->trade_type === 'negotiable',
            ])
            ->values()
            ->all();
    }

    /**
     * 進行中（active）のオークションを「現在価格（最良入札 or 開始価格）」で集約する。
     * 終了済みに現在価格は無いため active のみ対象。件数は少数想定なので入札の都度クエリで良い。
     *
     * @return array<int, array{name: string, price: int, currency: string, count: int, negotiable: bool}>
     */
    private function aggregateAuctions($rows): array
    {
        return $this->aggregate(
            $rows->filter(fn ($row) => $row->status === 'active')
                ->each(fn ($row) => $row->price = Auction::currentPrice($row))
        );
    }
}
