<?php

namespace App\Http\Controllers\Concerns;

use App\Models\BuyRequest;
use App\Models\TradeChat;
use App\Support\Auction;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * オークションの入札処理（出品・買取の取引希望＝入札に共通）。
 *
 * - 取引希望時に入札額(bid_price)を受け取り、リザーブ条件と「現在の最良入札より有利」を検証。
 * - 既存の open 入札があれば、より有利な額に更新（取り下げ不可）。
 * - 即決価格に達したら即時成立、それ以外は他入札者を outbid 状態にする（価格更新通知）。
 */
trait HandlesAuctionBids
{
    /** 取引希望（＝入札）を作成または更新する。 */
    protected function placeBid(Request $request, Model $source, $user)
    {
        $sourceKey = $source instanceof BuyRequest ? 'buy_request_id' : 'listing_id';

        $data = $request->validate([
            'server'    => 'required|in:Emerald,Diamond,Pearl',
            'bid_price' => 'required|integer|min:1',
            'note'      => 'nullable|string|max:1000',
        ]);
        $amount = (int) $data['bid_price'];

        if (!Auction::isValidBid($source, $amount)) {
            return $this->invalidBidResponse($source);
        }

        $requestIp = $request->ip();
        $created = false;
        $chat = DB::transaction(function () use ($source, $sourceKey, $user, $data, $amount, $requestIp, &$created) {
            // 既存の open 入札があれば更新（より有利な額のみ。上で検証済み）。
            $chat = TradeChat::where($sourceKey, $source->id)
                ->where('buyer_id', $user->id)
                ->where('status', 'open')
                ->first();

            if ($chat) {
                $chat->update(['bid_price' => $amount, 'server' => $data['server'], 'request_ip' => $requestIp]);
            } else {
                $created = true;
                $chat = TradeChat::create([
                    $sourceKey   => $source->id,
                    'buyer_id'   => $user->id,
                    'server'     => $data['server'],
                    'bid_price'  => $amount,
                    'request_ip' => $requestIp,
                ]);
                if (!empty($data['note'])) {
                    $chat->messages()->create(['user_id' => $user->id, 'message' => '【備考】' . $data['note']]);
                }
            }

            // 即決価格に達したら即時成立。それ以外は他入札者を outbid（価格更新通知）。
            if (Auction::meetsBuyout($source, $amount)) {
                Auction::conclude($source, $chat, null);
            } else {
                Auction::refreshOutbid($source);
            }
            return $chat;
        });

        return response()->json($chat->fresh()->load('messages.user:id,email'), $created ? 201 : 200);
    }

    /** 入札額が無効なときの 400 レスポンス（出品/買取で文言を変える）。 */
    protected function invalidBidResponse(Model $source)
    {
        $reserve = (int) $source->price;
        $msg = Auction::higherIsBetter($source)
            ? "入札額は最低取引価格（{$reserve}）以上で、現在の最高入札より高くしてください。"
            : "入札額は最高取引価格（{$reserve}）以下で、現在の最安入札より安くしてください。";

        return response()->json([
            'message'       => $msg,
            'best_bid'      => Auction::bestBid($source),
            'current_price' => Auction::currentPrice($source),
        ], 400);
    }
}
