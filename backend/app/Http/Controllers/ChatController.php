<?php

namespace App\Http\Controllers;

use App\Models\Listing;
use App\Models\TradeChat;
use App\Models\TradeHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChatController extends Controller
{
    private function assertParticipant(Request $request, TradeChat $chat): void
    {
        $user = $request->user();
        if ($chat->listing->user_id !== $user->id && $chat->buyer_id !== $user->id) {
            abort(403);
        }
    }

    public function show(Request $request, int $id)
    {
        $chat = TradeChat::with(['listing.item', 'listing.user:id,email', 'buyer:id,email', 'messages.user:id,email'])
            ->findOrFail($id);
        $this->assertParticipant($request, $chat);
        return response()->json($chat);
    }

    public function sendMessage(Request $request, int $id)
    {
        $chat = TradeChat::with('listing')->findOrFail($id);
        $this->assertParticipant($request, $chat);

        // open または deal のチャットのみ送信可能
        if (!in_array($chat->status, ['open', 'deal'])) {
            return response()->json(['message' => 'このチャットはクローズされています。'], 400);
        }

        // 出品が completed で、このチャットが open の場合は送信不可
        if ($chat->listing->status === 'completed' && $chat->status === 'open') {
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
        $chat = TradeChat::with(['listing.user'])->findOrFail($id);
        $user = $request->user();

        if ($chat->listing->user_id !== $user->id) {
            abort(403);
        }
        if ($chat->status !== 'open') {
            return response()->json(['message' => '既にクローズされています。'], 400);
        }

        DB::transaction(function () use ($chat, $request) {
            $chat->update(['status' => 'deal']);

            // 出品ステータスを「完了」に
            $chat->listing->update(['status' => 'completed']);

            // 取引履歴を記録
            $buyerIp  = $request->ip();
            $sellerIp = $chat->listing->user->register_ip ?? null;

            TradeHistory::create([
                'listing_id' => $chat->listing_id,
                'item_id'    => $chat->listing->item_id,
                'seller_id'  => $chat->listing->user_id,
                'seller_ip'  => $sellerIp,
                'buyer_ip'   => $buyerIp,
                'price'      => $chat->listing->price,
                'currency'   => $chat->listing->currency,
                'server'     => $chat->server,
                'is_valid'   => $buyerIp !== $sellerIp,
                'traded_at'  => now(),
            ]);
        });

        return response()->json($chat->fresh()->load('listing'));
    }

    public function dealFailed(Request $request, int $id)
    {
        $chat = TradeChat::with(['listing.servers'])->findOrFail($id);
        $user = $request->user();

        if ($chat->listing->user_id !== $user->id) {
            abort(403);
        }
        if ($chat->status !== 'deal') {
            return response()->json(['message' => '取引成立チャットではありません。'], 400);
        }

        $relist = $request->boolean('relist', false);

        DB::transaction(function () use ($chat, $relist) {
            // チャットを open に戻す
            $chat->update(['status' => 'open']);

            // 出品ステータスを不成立に
            $chat->listing->update(['status' => 'deal_failed']);

            if ($relist) {
                // 同じ内容で新規出品を作成
                $old = $chat->listing;
                $newListing = Listing::create([
                    'user_id'    => $old->user_id,
                    'item_id'    => $old->item_id,
                    'price'      => $old->price,
                    'currency'   => $old->currency,
                    'quantity'   => $old->quantity,
                    'trade_type' => $old->trade_type,
                    'comment'    => $old->comment,
                    'expires_at' => now()->addDays(7),
                ]);
                foreach ($old->servers as $srv) {
                    $newListing->servers()->create([
                        'server'       => $srv->server,
                        'character_id' => $srv->character_id,
                    ]);
                }
            }
        });

        return response()->json($chat->fresh()->load('listing'));
    }

    public function markComplete(Request $request, int $id)
    {
        $chat = TradeChat::with('listing')->findOrFail($id);
        $user = $request->user();

        $isSeller = $chat->listing->user_id === $user->id;
        $isBuyer  = $chat->buyer_id === $user->id;

        if (!$isSeller && !$isBuyer) {
            abort(403);
        }
        if ($chat->status !== 'deal') {
            return response()->json(['message' => '取引成立チャットではありません。'], 400);
        }

        $isSeller
            ? $chat->update(['seller_completed' => true])
            : $chat->update(['buyer_completed' => true]);

        return response()->json($chat->fresh());
    }

    public function decline(Request $request, int $id)
    {
        $chat = TradeChat::with('listing')->findOrFail($id);
        $user = $request->user();

        if ($chat->listing->user_id !== $user->id && $chat->buyer_id !== $user->id) {
            abort(403);
        }

        $chat->update(['status' => 'declined']);
        return response()->json($chat->fresh());
    }

    public function reopen(Request $request, int $id)
    {
        $chat = TradeChat::with('listing')->findOrFail($id);
        $user = $request->user();

        if ($chat->listing->user_id !== $user->id && $chat->buyer_id !== $user->id) {
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
              ->orWhere('buyer_id', $user->id);
        })->whereIn('status', ['open', 'deal'])->count();

        return response()->json(['unread_count' => $count]);
    }
}
