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
    use \App\Http\Controllers\Concerns\HandlesAuctionBids;

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

        // owner からは順番待ち（2番目以降）のチャットは匿名化して返す。
        // 誰からの取引希望か分からないようにし、先頭を見送るまで内容を見せない。
        if ($chat->ownerId() === $request->user()->id && $chat->isWaiting()) {
            $chat->setRelation('buyer', null);
            $chat->setRelation('messages', collect());
            $chat->buyer_character_name = null;
            $chat->is_locked = true;
        }
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

        // owner は順番待ち（2番目以降）のチャットには送信できない。先頭に対応してから。
        if ($chat->ownerId() === $request->user()->id && $chat->isWaiting()) {
            return response()->json(['message' => 'この取引希望はまだ順番待ちです。先頭の取引に対応してください。'], 400);
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
        // オークションは期限日/即決で自動成立する。owner が手動成立はできない。
        if ($chat->source()?->isAuction()) {
            return response()->json(['message' => 'オークションは期限日または即決価格で自動的に成立します。手動成立はできません。'], 400);
        }
        if ($chat->status !== 'open') {
            return response()->json(['message' => '既にクローズされています。'], 400);
        }
        // 先着順での対応を強制：順番待ち（2番目以降）は成立できない。
        if ($chat->isWaiting()) {
            return response()->json(['message' => '先着順での対応が必要です。先頭の取引希望に対応してください。'], 400);
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
            // このチャット（取引成立分）を「取引不成立」にする。
            $chat->update(['status' => 'deal_failed']);

            $source = $chat->source();

            // 成立時に記録した取引履歴を削除（不成立の価格を相場に残さない）
            if ($chat->isBuyRequest()) {
                TradeHistory::where('buy_request_id', $source->id)->delete();
            } else {
                TradeHistory::where('listing_id', $source->id)->delete();
            }

            // 残りの順番待ち（open チャット）があれば、取引対象を active に戻して次の取引希望に進む。
            // この場合は再出品しない（次の人との取引を続けるため）。
            if ($source->chats()->where('status', 'open')->exists()) {
                $source->update(['status' => 'active']);
                return;
            }

            // 順番待ちが無いときのみ deal_failed にし、必要なら再出品する。
            $source->update(['status' => 'deal_failed']);

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
        if ($isOwner) {
            $chat->update(['seller_completed' => true]);
            // 受け渡し完了（出品者/買取登録者が完了）になったら、残っている順番待ちを見送りにする。
            // この取引は確定したため、待っていたユーザー側のチャットは「見送り」として閉じる。
            $chat->source()->chats()->where('status', 'open')->update(['status' => 'declined']);
        } else {
            $chat->update(['buyer_completed' => true]);
        }

        return response()->json($chat->fresh());
    }

    public function decline(Request $request, int $id)
    {
        $chat = $this->loadSource(TradeChat::findOrFail($id));
        $user = $request->user();

        if ($chat->ownerId() !== $user->id && $chat->buyer_id !== $user->id) {
            abort(403);
        }
        // オークションは取り下げ・見送り不可（入札は撤回できず、期限日に自動成立する）。
        if ($chat->source()?->isAuction()) {
            return response()->json(['message' => 'オークションでは入札の取り下げ・見送りはできません。'], 400);
        }
        // owner が見送る場合は先着順を強制（先頭から順に見送る）。相手側の取り下げは順不同で可。
        if ($chat->ownerId() === $user->id && $chat->isWaiting()) {
            return response()->json(['message' => '先着順での対応が必要です。先頭の取引希望から見送ってください。'], 400);
        }

        $chat->update(['status' => 'declined']);
        return response()->json($chat->fresh());
    }

    /**
     * オークションの入札額を更新する（マイ取引から）。より有利な額のみ可・取り下げ不可。
     * 即決価格に達した場合はその場で成立する。
     */
    public function bid(Request $request, int $id)
    {
        $chat = $this->loadSource(TradeChat::findOrFail($id));
        $user = $request->user();

        if ($chat->buyer_id !== $user->id) {
            abort(403);
        }
        $source = $chat->source();
        if (!$source || !$source->isAuction()) {
            return response()->json(['message' => 'オークションの入札ではありません。'], 400);
        }
        if ($source->status !== 'active' || ($source->expires_at && $source->expires_at->isPast())) {
            return response()->json(['message' => 'このオークションは終了しています。'], 400);
        }
        if ($chat->status !== 'open') {
            return response()->json(['message' => 'この入札はクローズされています。'], 400);
        }

        $data = $request->validate(['bid_price' => 'required|integer|min:1']);
        $amount = (int) $data['bid_price'];

        if (!\App\Support\Auction::isValidBid($source, $amount)) {
            return $this->invalidBidResponse($source);
        }

        DB::transaction(function () use ($chat, $source, $amount, $request) {
            $chat->update(['bid_price' => $amount, 'request_ip' => $request->ip()]);
            if (\App\Support\Auction::meetsBuyout($source, $amount)) {
                \App\Support\Auction::conclude($source, $chat, null);
            } else {
                \App\Support\Auction::refreshOutbid($source);
            }
        });

        return $this->respondWithSource($chat->fresh());
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
