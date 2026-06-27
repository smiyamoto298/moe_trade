<?php

namespace App\Support;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Models\TradeChat;
use App\Models\TradeHistory;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * オークション取引の共通ロジック。
 *
 * 出品(Listing)は「高い入札ほど有利」、買取(BuyRequest)は「安い入札ほど有利」。
 * price = 開始価格 兼 リザーブ（出品=下限 / 買取=上限）、buyout_price = 即決価格。
 * 入札は status='open' の TradeChat のうち bid_price を持つもの。
 */
class Auction
{
    /** 解決バッチの実行間隔（分）。期限日はこの単位に丸める。 */
    public const RESOLVE_INTERVAL_MIN = 15;

    /**
     * オークションの期限日を解決バッチの実行間隔（15分単位）に丸める。
     * これにより締切到来とバッチ実行のズレを最小化し、締切後すぐに自動成立できるようにする。
     * 0秒・15分単位に揃え、端数は切り上げる（指定時刻より早く締め切らない）。
     */
    public static function roundDeadline(CarbonInterface|string $at): Carbon
    {
        $dt = Carbon::parse($at)->startOfMinute();
        $step = self::RESOLVE_INTERVAL_MIN;
        $remainder = $dt->minute % $step;
        if ($remainder !== 0) {
            $dt->addMinutes($step - $remainder);
        }
        return $dt;
    }

    /** 出品は高いほど有利、買取は安いほど有利。 */
    public static function higherIsBetter(Model $source): bool
    {
        return !($source instanceof BuyRequest);
    }

    /** 現在の最良入札額（open 入札のうち最良）。入札が無ければ null。 */
    public static function bestBid(Model $source): ?int
    {
        $q = $source->chats()->where('status', 'open')->whereNotNull('bid_price');
        $v = self::higherIsBetter($source) ? $q->max('bid_price') : $q->min('bid_price');
        return $v !== null ? (int) $v : null;
    }

    /** 現在価格（最良入札 or 開始価格=price）。 */
    public static function currentPrice(Model $source): int
    {
        return self::bestBid($source) ?? (int) $source->price;
    }

    /** open 入札の件数。 */
    public static function bidCount(Model $source): int
    {
        return $source->chats()->where('status', 'open')->whereNotNull('bid_price')->count();
    }

    /**
     * 候補額 $amount が有効な入札か（リザーブ条件を満たし、かつ現在の最良入札より有利）。
     * 出品: price 以上 かつ 最良入札より高い / 買取: price 以下 かつ 最良入札より安い。
     */
    public static function isValidBid(Model $source, int $amount): bool
    {
        $best = self::bestBid($source);
        if (self::higherIsBetter($source)) {
            return $amount >= (int) $source->price && ($best === null || $amount > $best);
        }
        return $amount <= (int) $source->price && ($best === null || $amount < $best);
    }

    /** 即決価格に達したか。 */
    public static function meetsBuyout(Model $source, int $amount): bool
    {
        if ($source->buyout_price === null) {
            return false;
        }
        return self::higherIsBetter($source)
            ? $amount >= (int) $source->buyout_price
            : $amount <= (int) $source->buyout_price;
    }

    /**
     * オークションを落札成立させる（ChatController@deal と同じ取引履歴ロジック）。
     * 落札チャットを deal、源を completed、取引履歴を記録し、他の open 入札を declined にする。
     *
     * @param  string|null  $ownerIp  owner 側の操作IP（バッチ自動成立では null）
     */
    public static function conclude(Model $source, TradeChat $winningChat, ?string $ownerIp = null): void
    {
        DB::transaction(function () use ($source, $winningChat, $ownerIp) {
            $winningChat->update(['status' => 'deal']);
            $source->update(['status' => 'completed']);

            $dealPrice   = (int) ($winningChat->bid_price ?? $source->price);
            $isBuyReq    = $source instanceof BuyRequest;
            $responderIp = $winningChat->request_ip; // 入札（取引希望）を送ったIP

            // 売り手・買い手の user_id と IP を役割に合わせて決定（出品/買取で反転）。
            if ($isBuyReq) {
                // 買取: owner=買い手 / 落札者=売り手（入札）
                $sellerId = $winningChat->buyer_id; $sellerIp = $responderIp;
                $buyerId  = $source->user_id;       $buyerIp  = $ownerIp;
            } else {
                // 出品: owner=売り手 / 落札者=買い手（入札）
                $sellerId = $source->user_id;       $sellerIp = $ownerIp;
                $buyerId  = $winningChat->buyer_id;  $buyerIp  = $responderIp;
            }

            // 同一IPは同一人物の取引とみなし相場対象外。IP片側 null（自動成立）は有効扱い。
            $isValid = config('app.treat_all_trades_valid')
                ? true
                : ($sellerIp === null || $buyerIp === null || $sellerIp !== $buyerIp);

            TradeHistory::create([
                'listing_id'     => $isBuyReq ? null : $source->id,
                'buy_request_id' => $isBuyReq ? $source->id : null,
                'item_id'        => $source->item_id,
                'seller_id'      => $sellerId,
                'buyer_id'       => $buyerId,
                'seller_ip'      => $sellerIp,
                'buyer_ip'       => $buyerIp,
                'price'          => $dealPrice,
                'currency'       => $source->currency,
                'server'         => $winningChat->server,
                'is_valid'       => $isValid,
                'traded_at'      => now(),
            ]);

            // 落札者以外の open 入札は不成立（declined）にする。
            $source->chats()
                ->where('status', 'open')
                ->where('id', '!=', $winningChat->id)
                ->update(['status' => 'declined']);
        });
    }

    /**
     * 期限到来したオークションを解決する。
     * open 入札あり → 最良入札を落札成立 / 入札なし → expired（自動取り下げ・再出品なし）。
     */
    public static function resolveExpired(Model $source): void
    {
        $best = $source->chats()
            ->where('status', 'open')
            ->whereNotNull('bid_price')
            ->orderBy('bid_price', self::higherIsBetter($source) ? 'desc' : 'asc')
            ->orderBy('id') // 同額は先着優先
            ->first();

        if ($best) {
            self::conclude($source, $best, null);
        } else {
            $source->update(['status' => 'expired']);
        }
    }

    /**
     * 入札後、最良入札以外の open 入札に outbid_at を立てる（最良はクリア）。
     * 「より有利な入札に抜かれた」入札者への価格更新通知に使う。
     *
     * あわせて、入札で現在価格が更新されたオークションを**宣伝ポストの対象**に再浮上させる
     * （`bumped_at` を更新。宣伝ポストは `COALESCE(bumped_at, created_at)` で対象期間を判定するため、
     *  出品時は created_at で、入札価格更新時はここで対象になる）。
     */
    public static function refreshOutbid(Model $source): void
    {
        // 価格更新（accepted な入札はすべて現在価格を更新する）→ 新着扱い・宣伝ポスト対象に。
        $source->update(['bumped_at' => now()]);

        $best = $source->chats()
            ->where('status', 'open')
            ->whereNotNull('bid_price')
            ->orderBy('bid_price', self::higherIsBetter($source) ? 'desc' : 'asc')
            ->orderBy('id')
            ->first();
        if (!$best) {
            return;
        }
        $source->chats()
            ->where('status', 'open')
            ->whereNotNull('bid_price')
            ->where('id', '!=', $best->id)
            ->update(['outbid_at' => now()]);
        $source->chats()->whereKey($best->id)->update(['outbid_at' => null]);
    }
}
