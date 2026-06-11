<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Models\TradeChat;
use App\Models\TradeHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * 取引チャット。出品(listing)・買取(buy_request)の双方に対応する。
 *
 * 役割整理:
 *   - source = チャットの取引対象（Listing または BuyRequest）
 *   - owner   = source の登録者（出品者 or 買取登録者）。取引成立/不成立を決定する側。
 *   - 相手側  = chat.buyer_id（取引希望を送ってきたユーザー）
 *
 * 完了フラグは「役割」ではなく「登録者側/相手側」で扱う:
 *   - owner が完了    → seller_completed
 *   - 相手側が完了    → buyer_completed
 * （フロント ChatThread が isOwner で同じ対応付けを前提にしているため）
 */
class ChatController extends Controller
{
    /** チャットに必要なリレーションを読み込む。 */
    private function loadSource(TradeChat $chat): TradeChat
    {
        return $chat->load([
            'listing.item', 'listing.user:id,email', 'listing.servers',
            'buyRequest.item', 'buyRequest.user:id,email', 'buyRequest.servers',
        ]);
    }

    private function assertParticipant(Request $request, TradeChat $chat): void
    {
        $user = $request->user();
        if ($chat->ownerId() !== $user->id && $chat->buyer_id !== $user->id) {
            abort(403);
        }
    }

    public function show(Request $request, int $id)
    {
        $chat = TradeChat::with([
            'listing.item', 'listing.user:id,email',
            'buyRequest.item', 'buyRequest.user:id,email',
            'buyer:id,email', 'messages.user:id,email',
        ])->findOrFail($id);
        $this->assertParticipant($request, $chat);
        return response()->json($chat);
    }

    public function sendMessage(Request $request, int $id)
    {
        $chat = $this->loadSource(TradeChat::findOrFail($id));
        $this->assertParticipant($request, $chat);

        // open または deal のチャットのみ送信可能
        if (!in_array($chat->status, ['open', 'deal'])) {
            return response()->json(['message' => 'このチャットはクローズされています。'], 400);
        }

        // 取引対象が completed で、このチャットが open の場合は送信不可（他取引が成立）
        if ($chat->source()?->status === 'completed' && $chat->status === 'open') {
            return response()->json(['message' => '他のユーザーの取引が成立しています。'], 400);
        }

        $data = $request->validate(['message' => 'required|string|max:2000']);

        $msg = $chat->messages()->create([
            'user_id' => $request->user()->id,
            'message' => $data['message'],
        ]);

        return response()->json($msg->load('user:id,email'), 201);
    }

    public function deal(Request $request, int $id)
    {
        $chat = $this->loadSource(TradeChat::findOrFail($id));
        $user = $request->user();

        if ($chat->ownerId() !== $user->id) {
            abort(403);
        }
        if ($chat->status !== 'open') {
            return response()->json(['message' => '既にクローズされています。'], 400);
        }

        // 交渉可の場合、登録者が成立価格を入力できる。未指定なら出品/買取価格を使用する。
        $validated = $request->validate([
            'final_price' => 'nullable|integer|min:1',
        ]);

        DB::transaction(function () use ($chat, $request, $validated) {
            $chat->update(['status' => 'deal']);

            $source = $chat->source();
            $source->update(['status' => 'completed']);

            // 取引履歴に記録する価格（交渉可で成立価格が指定されていればそれを優先）
            $dealPrice = $validated['final_price'] ?? $source->price;

            // IPは「取引希望を送信したときのIP（chat.request_ip）」と
            // 「取引成立を送信したときのIP（リクエストIP）」で突き合わせる。
            //   - 取引成立を操作するのは owner（出品者 or 買取登録者）
            //   - 取引希望を送ったのは相手側（chat.buyer_id）
            $ownerIp     = $request->ip();      // 取引成立を送信したIP
            $responderIp = $chat->request_ip;   // 取引希望を送信したIP

            // 売り手・買い手の user_id と IP を役割に合わせて決定（出品/買取で反転）。
            if ($chat->isBuyRequest()) {
                // 買取: owner=買い手（成立操作） / 相手側=売り手（取引希望）
                $sellerId = $chat->buyer_id;   $sellerIp = $responderIp;
                $buyerId  = $source->user_id;  $buyerIp  = $ownerIp;
            } else {
                // 出品: owner=売り手（成立操作） / 相手側=買い手（取引希望）
                $sellerId = $source->user_id;  $sellerIp = $ownerIp;
                $buyerId  = $chat->buyer_id;   $buyerIp  = $responderIp;
            }

            // 取引希望と取引成立が同一IPの場合は同一人物の取引とみなし相場対象外（is_valid=false）。
            // TREAT_ALL_TRADES_VALID=true のときのみ全件有効扱い（ローカル手動検証用）。
            $isValid = config('app.treat_all_trades_valid')
                ? true
                : ($sellerIp === null || $buyerIp === null || $sellerIp !== $buyerIp);

            TradeHistory::create([
                'listing_id'     => $chat->isBuyRequest() ? null : $source->id,
                'buy_request_id' => $chat->isBuyRequest() ? $source->id : null,
                'item_id'        => $source->item_id,
                'seller_id'      => $sellerId,
                'buyer_id'       => $buyerId,
                'seller_ip'      => $sellerIp,
                'buyer_ip'       => $buyerIp,
                'price'          => $dealPrice,
                'currency'       => $source->currency,
                'server'         => $chat->server,
                'is_valid'       => $isValid,
                'traded_at'      => now(),
            ]);
        });

        return $this->respondWithSource($chat->fresh());
    }

    public function dealFailed(Request $request, int $id)
    {
        $chat = $this->loadSource(TradeChat::findOrFail($id));
        $user = $request->user();

        if ($chat->ownerId() !== $user->id) {
            abort(403);
        }
        if ($chat->status !== 'deal') {
            return response()->json(['message' => '取引成立チャットではありません。'], 400);
        }

        $relist = $request->boolean('relist', false);

        DB::transaction(function () use ($chat, $relist) {
            // チャットを「取引不成立」にして編集不可にする（交渉中には戻さない）。
            // 再取引が必要な場合は relist で新規に出品し直す。
            $chat->update(['status' => 'deal_failed']);

            $source = $chat->source();
            $source->update(['status' => 'deal_failed']);

            // 成立時に記録した取引履歴を削除（不成立の価格を相場に残さない）
            if ($chat->isBuyRequest()) {
                TradeHistory::where('buy_request_id', $source->id)->delete();
            } else {
                TradeHistory::where('listing_id', $source->id)->delete();
            }

            if ($relist) {
                // 同じ内容で再登録（出品/買取それぞれ）
                if ($chat->isBuyRequest()) {
                    $new = BuyRequest::create([
                        'user_id'    => $source->user_id,
                        'item_id'    => $source->item_id,
                        'price'      => $source->price,
                        'currency'   => $source->currency,
                        'quantity'   => $source->quantity,
                        'trade_type' => $source->trade_type,
                        'comment'    => $source->comment,
                        'expires_at' => now()->addMonth(),
                    ]);
                } else {
                    $new = Listing::create([
                        'user_id'    => $source->user_id,
                        'item_id'    => $source->item_id,
                        'price'      => $source->price,
                        'currency'   => $source->currency,
                        'quantity'   => $source->quantity,
                        'trade_type' => $source->trade_type,
                        'comment'    => $source->comment,
                        'expires_at' => now()->addDays(7),
                    ]);
                }
                foreach ($source->servers as $srv) {
                    $new->servers()->create([
                        'server'       => $srv->server,
                        'character_id' => $srv->character_id,
                    ]);
                }
            }
        });

        return $this->respondWithSource($chat->fresh());
    }

    public function markComplete(Request $request, int $id)
    {
        $chat = $this->loadSource(TradeChat::findOrFail($id));
        $user = $request->user();

        $isOwner     = $chat->ownerId() === $user->id;
        $isResponder = $chat->buyer_id === $user->id;

        if (!$isOwner && !$isResponder) {
            abort(403);
        }
        if ($chat->status !== 'deal') {
            return response()->json(['message' => '取引成立チャットではありません。'], 400);
        }

        // owner → seller_completed / 相手側 → buyer_completed
        $isOwner
            ? $chat->update(['seller_completed' => true])
            : $chat->update(['buyer_completed' => true]);

        return response()->json($chat->fresh());
    }

    public function decline(Request $request, int $id)
    {
        $chat = $this->loadSource(TradeChat::findOrFail($id));
        $user = $request->user();

        if ($chat->ownerId() !== $user->id && $chat->buyer_id !== $user->id) {
            abort(403);
        }

        $chat->update(['status' => 'declined']);
        return response()->json($chat->fresh());
    }

    public function reopen(Request $request, int $id)
    {
        $chat = $this->loadSource(TradeChat::findOrFail($id));
        $user = $request->user();

        if ($chat->ownerId() !== $user->id && $chat->buyer_id !== $user->id) {
            abort(403);
        }

        $chat->update(['status' => 'open']);
        return response()->json($chat->fresh());
    }

    public function unreadCount(Request $request)
    {
        $user = $request->user();
        $count = TradeChat::where(function ($q) use ($user) {
            $q->whereHas('listing', fn($lq) => $lq->where('user_id', $user->id))
              ->orWhereHas('buyRequest', fn($bq) => $bq->where('user_id', $user->id))
              ->orWhere('buyer_id', $user->id);
        })->whereIn('status', ['open', 'deal'])->count();

        return response()->json(['unread_count' => $count]);
    }

    /** ステータス変更後のチャットに source（listing/buyRequest）を添えて返す。 */
    private function respondWithSource(TradeChat $chat)
    {
        return response()->json($this->loadSource($chat));
    }
}
