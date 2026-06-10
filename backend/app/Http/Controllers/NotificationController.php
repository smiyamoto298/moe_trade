<?php

namespace App\Http\Controllers;

use App\Models\BoardPost;
use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\TradeChat;
use App\Models\User;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * 通知サマリー（5秒ポーリング用）。
     *
     * - unread_chats: 自分が当事者の open/deal チャットのうち、最後の発言が相手のもの
     *   （メッセージが無い場合はチャット作成＝新規取引希望として扱う）
     * - board: 運営掲示板の自分に関係する最新投稿
     *   （admin: 他人の全投稿 / 一般: 自分のスレッドへの他人の投稿）
     *
     * 既読管理はクライアント側（localStorage）で行うため、ここでは状態を持たない。
     */
    public function summary(Request $request)
    {
        $user = $request->user();

        // ---- チャット（出品・買取の両方） ----
        $chats = TradeChat::with([
                'listing:id,user_id',
                'buyRequest:id,user_id',
                'messages' => fn($q) => $q->orderByDesc('id'),
                'messages.user.characters',
            ])
            ->whereIn('status', ['open', 'deal'])
            ->where(function ($q) use ($user) {
                $q->whereHas('listing', fn($lq) => $lq->where('user_id', $user->id))
                  ->orWhereHas('buyRequest', fn($bq) => $bq->where('user_id', $user->id))
                  ->orWhere('buyer_id', $user->id);
            })
            ->get();

        $unreadChats = $chats->map(function (TradeChat $chat) use ($user) {
            // messages リレーションは created_at 昇順のため、最新メッセージは id 最大で取得する。
            $last = $chat->messages->sortByDesc('id')->first();

            // 最後の発言者が自分なら未読扱いしない。
            // メッセージが無いチャットは、相手側が作成した時点を「新規取引希望」とする。
            $fromOther = $last ? $last->user_id !== $user->id : $chat->buyer_id !== $user->id;
            if (!$fromOther) {
                return null;
            }

            $ownerId  = $chat->ownerId();
            $isBuyReq = $chat->isBuyRequest();

            return [
                'chat_id'             => $chat->id,
                'source_type'         => $chat->sourceType(),
                'listing_id'          => $chat->listing_id,
                'buy_request_id'      => $chat->buy_request_id,
                'buyer_id'            => $chat->buyer_id,
                // 後方互換: listing 由来のときだけ listing_user_id を埋める
                'listing_user_id'     => $isBuyReq ? null : $ownerId,
                'buy_request_user_id' => $isBuyReq ? $ownerId : null,
                'owner_id'            => $ownerId,
                'last_message_at'     => ($last?->created_at ?? $chat->created_at)->toISOString(),
                'last_message'        => $last?->message ?? '新しい取引希望が届きました',
                'last_sender'         => $last ? $this->displayName($last->user) : '取引希望者',
            ];
        })->filter()->values();

        // ---- 運営掲示板 ----
        // 管理者: すべてのスレッドの他人の投稿が対象。
        // 一般ユーザー: 自分がコメント（投稿）したスレッドの他人の投稿のみ対象。
        // （スレッド作成時に作成者の最初の投稿が作られるため、自分が立てたスレッドも含まれる）
        $boardQuery = BoardPost::where('user_id', '!=', $user->id);

        if (!$user->isAdmin()) {
            $commentedThreadIds = BoardPost::where('user_id', $user->id)
                ->distinct()
                ->pluck('thread_id');
            $boardQuery->whereIn('thread_id', $commentedThreadIds);
        }

        // スレッドごとの最新投稿日時（一覧の未読アイコン用）
        $boardThreads = (clone $boardQuery)
            ->selectRaw('thread_id, MAX(created_at) as latest_post_at')
            ->groupBy('thread_id')
            ->get()
            ->map(fn ($r) => [
                'thread_id'      => (int) $r->thread_id,
                'latest_post_at' => \Illuminate\Support\Carbon::parse($r->latest_post_at)->toISOString(),
            ])
            ->values();

        $latestPost = $boardQuery->with('thread:id,title')->orderByDesc('id')->first();

        // ---- 未確認アイテム（editor / admin のみ） ----
        // 「テクニック」親カテゴリ配下をテクニック、それ以外を装備品として件数を分ける。
        $unverifiedItems = null;
        if ($user->isEditor()) {
            // トップカテゴリ名 → 配下カテゴリID群（トップ自身も含む）を取得するヘルパー
            $idsForTop = function (string $name): array {
                $parent = ItemCategory::whereNull('parent_id')->where('name', $name)->first();
                return $parent
                    ? ItemCategory::where('id', $parent->id)
                        ->orWhere('parent_id', $parent->id)
                        ->pluck('id')
                        ->all()
                    : [];
            };

            $techIds  = $idsForTop('テクニック');
            $assetIds = $idsForTop('アセット');

            $technique = count($techIds) > 0
                ? Item::where('verified_status', 'unverified')->whereIn('category_id', $techIds)->count()
                : 0;
            $asset = count($assetIds) > 0
                ? Item::where('verified_status', 'unverified')->whereIn('category_id', $assetIds)->count()
                : 0;
            $equipment = Item::where('verified_status', 'unverified')
                ->when(count($techIds) > 0, fn ($q) => $q->whereNotIn('category_id', $techIds))
                ->when(count($assetIds) > 0, fn ($q) => $q->whereNotIn('category_id', $assetIds))
                ->count();

            $unverifiedItems = [
                'equipment' => $equipment,
                'technique' => $technique,
                'asset'     => $asset,
                'total'     => $equipment + $technique + $asset,
            ];
        }

        return response()->json([
            'unread_chats' => $unreadChats,
            'board' => $latestPost ? [
                'latest_post_at' => $latestPost->created_at->toISOString(),
                'thread_id'      => $latestPost->thread_id,
                'thread_title'   => $latestPost->thread->title ?? '',
            ] : null,
            'board_threads' => $boardThreads,
            'unverified_items' => $unverifiedItems,
        ]);
    }

    private function displayName(?User $user): string
    {
        if (!$user) {
            return '退会ユーザー';
        }
        $char = $user->relationLoaded('characters')
            ? $user->characters->first()
            : $user->characters()->first();

        return $char?->character_name ?? "ユーザー#{$user->id}";
    }
}
