<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;
use App\Models\BuyRequestServer;
use App\Models\TradeChat;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * 買取（買いたい）。
 *
 * 出品(ListingController)と対称の機能を提供する。
 * 一覧の絞り込みは「アイテム名のみ」で、装備品・テクニック・アセットを
 * 種別で分けずにまとめて検索する（種別タブを持たない）。
 * 単一の item_name（部分一致）に加え、複数アイテム名（item_names[]）での
 * 絞り込みにも対応する（一括出品のアイテム一覧貼り付けに対応）。
 */
class BuyRequestController extends Controller
{
    public function index(Request $request)
    {
        $includeCompleted = $request->boolean('include_completed', false);
        $statuses = $includeCompleted ? ['active', 'completed'] : ['active'];

        $query = BuyRequest::with(['item.category', 'item.bonusEffects', 'item.setMembers.category', 'item.setMembers.bonusEffects', 'user:id,email', 'user.characters', 'servers'])
            ->visible($statuses)
            ->whereHas('user', fn($q) => $q->where('is_suspended', false));

        // --- アイテム名フィルター（単一・部分一致） ---
        $query->when($request->item_name, fn($q) =>
            $q->whereHas('item', fn($iq) => $iq->where('name', 'like', '%' . $request->item_name . '%'))
        );

        // --- 複数アイテム名フィルター（item_names[]・いずれかに一致） ---
        // 末尾が "..." / "…"（公式サイトの省略表記）の場合は前方一致、それ以外は完全一致。
        $names = array_values(array_filter(array_map(
            fn($n) => is_string($n) ? trim($n) : '',
            (array) $request->input('item_names', [])
        ), fn($n) => $n !== ''));

        if (!empty($names)) {
            $query->whereHas('item', function ($iq) use ($names) {
                $iq->where(function ($w) use ($names) {
                    foreach ($names as $name) {
                        $isTruncated = (bool) preg_match('/(\.\.\.|…)\s*$/u', $name);
                        $base = trim(preg_replace('/\s*(\.\.\.|…)\s*$/u', '', $name));
                        if ($isTruncated && $base !== '') {
                            $escaped = addcslashes($base, '%_\\');
                            $w->orWhere('name', 'like', $escaped . '%');
                        } else {
                            $w->orWhere('name', $name);
                        }
                    }
                });
            });
        }

        // --- 補助フィルター（任意） ---
        $query->when($request->trade_type, fn($q) => $q->where('trade_type', $request->trade_type));

        $minPrice = $request->price_min ?? $request->min_price;
        $maxPrice = $request->price_max ?? $request->max_price;
        $query->when($minPrice, fn($q) => $q->where('price', '>=', $minPrice));
        $query->when($maxPrice, fn($q) => $q->where('price', '<=', $maxPrice));

        if ($request->servers) {
            $servers = (array) $request->servers;
            $query->whereHas('servers', fn($q) => $q->whereIn('server', $servers));
        }

        // --- ソート ---
        $sort = $request->sort ?? 'newest';
        if ($sort === 'name_asc' || $sort === 'name_desc') {
            // アイテム名（あいうえお順）。かなは符号位置順で概ね五十音順になる。
            $dir = $sort === 'name_asc' ? 'ASC' : 'DESC';
            $query->join('items as sort_item_name', 'buy_requests.item_id', '=', 'sort_item_name.id')
                  ->orderBy('sort_item_name.name', $dir)
                  ->select('buy_requests.*');
        } else {
            match ($sort) {
                'price_asc'  => $query->orderBy('price'),
                'price_desc' => $query->orderByDesc('price'),
                default      => $query->latest(),
            };
        }

        // 現在の売却申し出者数（順番待ち人数）。一覧の取引パネルで「N人待ち」を表示するのに使う。
        $query->withCount(['chats as waiting_count' => fn($q) => $q->where('status', 'open')]);

        $result = $query->paginate(20);
        $result->getCollection()->each(fn(BuyRequest $b) => $b->resolveServerContacts());

        return response()->json($result);
    }

    /**
     * 指定アイテム群について、現在募集中（active）の最高額買取を item_id ごとに返す。
     * 所持アイテム管理で「他ユーザーが買取中の価格」を表示し、クリックで買取詳細へ遷移するのに使う。
     * 買取が複数あるときは最高額を採用し、件数（count）も併せて返す。
     * 戻り値: { "<item_id>": { buy_request_id, price, currency, count } }
     */
    public function prices(Request $request)
    {
        $data = $request->validate([
            'item_ids'   => 'required|array|max:500',
            'item_ids.*' => 'integer',
        ]);

        $itemIds = array_values(array_unique(array_map('intval', $data['item_ids'])));
        if (empty($itemIds)) {
            return response()->json((object) []);
        }

        // アイテムごとに最高額の active 買取を選ぶ（期限内・停止ユーザーは除外）。
        $rows = BuyRequest::whereIn('item_id', $itemIds)
            ->visible(['active'])
            ->whereHas('user', fn($q) => $q->where('is_suspended', false))
            ->orderByDesc('price')
            ->orderByDesc('id')
            ->get(['id', 'item_id', 'price', 'currency']);

        $result = [];
        foreach ($rows as $row) {
            // 件数を数えつつ、最初に出てきた（＝最高額）ものを採用
            if (isset($result[$row->item_id])) {
                $result[$row->item_id]['count']++;
                continue;
            }
            $result[$row->item_id] = [
                'buy_request_id' => $row->id,
                'price'          => $row->price,
                'currency'       => $row->currency,
                'count'          => 1,
            ];
        }

        return response()->json((object) $result);
    }

    public function show(int $id)
    {
        $buyRequest = BuyRequest::with(['item.category', 'item.bonusEffects', 'item.setMembers.category', 'item.setMembers.bonusEffects', 'user:id,email', 'user.characters', 'servers'])
            ->visible(['active', 'completed'])
            ->findOrFail($id);
        $buyRequest->resolveServerContacts();
        // 現在の売却申し出者数（順番待ち人数）。「この取引はN人待ちです」の表示に使う。
        $buyRequest->waiting_count = $buyRequest->chats()->where('status', 'open')->count();
        return response()->json($buyRequest);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        if (!$user->hasVerifiedEmail()) {
            return response()->json(['message' => 'メール認証が必要です。'], 403);
        }
        if ($user->is_suspended) {
            return response()->json(['message' => 'アカウントが停止されています。'], 403);
        }

        $data = $request->validate([
            'item_id'    => 'required|exists:items,id',
            'price'      => 'required|integer|min:1',
            'quantity'   => 'required|integer|min:1',
            'trade_type' => 'required|in:fixed,negotiable',
            'comment'    => 'nullable|string|max:1000',
            'servers'    => 'required|array|min:1',
            'servers.*.server'       => 'required|in:Emerald,Diamond,Pearl',
            'servers.*.character_id' => 'nullable|exists:user_characters,id',
        ]);

        $buyRequest = DB::transaction(function () use ($data, $user) {
            $buyRequest = BuyRequest::create([
                'user_id'    => $user->id,
                'item_id'    => $data['item_id'],
                'price'      => $data['price'],
                'quantity'   => $data['quantity'],
                'trade_type' => $data['trade_type'],
                'comment'    => $data['comment'] ?? null,
                'currency'   => 'AC',
                'expires_at' => now()->addMonth(),
            ]);

            foreach ($data['servers'] as $srv) {
                BuyRequestServer::create([
                    'buy_request_id' => $buyRequest->id,
                    'server'         => $srv['server'],
                    'character_id'   => $srv['character_id'] ?? null,
                ]);
            }

            return $buyRequest;
        });

        return response()->json($buyRequest->load('item', 'servers'), 201);
    }

    public function update(Request $request, int $id)
    {
        $buyRequest = BuyRequest::findOrFail($id);
        $this->authorize('update', $buyRequest);

        $data = $request->validate([
            'price'      => 'sometimes|integer|min:1',
            'quantity'   => 'sometimes|integer|min:1',
            'trade_type' => 'sometimes|in:fixed,negotiable',
            'comment'    => 'nullable|string|max:1000',
            'servers'    => 'sometimes|array|min:1',
            'servers.*.server'       => 'required|in:Emerald,Diamond,Pearl',
            'servers.*.character_id' => 'nullable|exists:user_characters,id',
        ]);

        DB::transaction(function () use ($buyRequest, $data) {
            $buyRequest->update(collect($data)->except('servers')->toArray());

            if (isset($data['servers'])) {
                $buyRequest->servers()->delete();
                foreach ($data['servers'] as $srv) {
                    BuyRequestServer::create([
                        'buy_request_id' => $buyRequest->id,
                        'server'         => $srv['server'],
                        'character_id'   => $srv['character_id'] ?? null,
                    ]);
                }
            }
        });

        return response()->json($buyRequest->fresh()->load('item', 'servers'));
    }

    public function destroy(Request $request, int $id)
    {
        $buyRequest = BuyRequest::findOrFail($id);
        $user = $request->user();

        if ($buyRequest->user_id !== $user->id && !$user->isAdmin()) {
            abort(403);
        }

        $buyRequest->update(['status' => 'cancelled']);
        return response()->json(null, 204);
    }

    public function renew(Request $request, int $id)
    {
        $buyRequest = BuyRequest::where('user_id', $request->user()->id)->findOrFail($id);
        $buyRequest->update([
            'status'     => 'active',
            'expires_at' => now()->addMonth(),
        ]);
        return response()->json($buyRequest);
    }

    /** 買取登録者向け：自分の買取に届いたチャット一覧。 */
    public function chats(Request $request, int $id)
    {
        $buyRequest = BuyRequest::findOrFail($id);

        if ($buyRequest->user_id !== $request->user()->id) {
            abort(403);
        }

        $chats = $buyRequest->chats()->with(['buyer:id,email', 'messages.user:id,email'])->get();
        return response()->json($chats);
    }

    /** 売り手（相手側）が買取登録者へ取引希望を送る。 */
    public function createChat(Request $request, int $id)
    {
        $user = $request->user();

        if (!$user->hasVerifiedEmail()) {
            return response()->json(['message' => 'メール認証が必要です。'], 403);
        }

        $buyRequest = BuyRequest::findOrFail($id);

        if ($buyRequest->status !== 'active' || ($buyRequest->expires_at && $buyRequest->expires_at->isPast())) {
            return response()->json(['message' => 'この買取は取引できません。'], 400);
        }
        if ($buyRequest->user_id === $user->id) {
            return response()->json(['message' => '自分の買取には取引希望できません。'], 400);
        }

        $data = $request->validate([
            'server'         => 'required|in:Emerald,Diamond,Pearl',
            'preferred_time' => 'nullable|string|max:200',
            'note'           => 'nullable|string|max:1000',
        ]);

        $existing = TradeChat::where('buy_request_id', $id)
            ->where('buyer_id', $user->id)
            ->where('status', 'open')
            ->first();

        if ($existing) {
            return response()->json($existing->load('messages.user:id,email'), 200);
        }

        $requestIp = $request->ip(); // 取引希望を送信したIP
        $chat = DB::transaction(function () use ($buyRequest, $user, $data, $requestIp) {
            // 取引希望を受けた買取の残りが3日以下なら、残り4日まで延長する
            if ($buyRequest->expires_at && $buyRequest->expires_at->lte(now()->addDays(3))) {
                $buyRequest->update(['expires_at' => now()->addDays(4)]);
            }

            $chat = TradeChat::create([
                'buy_request_id' => $buyRequest->id,
                'buyer_id'       => $user->id,
                'server'         => $data['server'],
                'request_ip'     => $requestIp,
            ]);

            $body = '';
            if (!empty($data['preferred_time'])) {
                $body .= "【希望時間帯】{$data['preferred_time']}\n";
            }
            if (!empty($data['note'])) {
                $body .= "【備考】{$data['note']}";
            }
            if ($body) {
                $chat->messages()->create([
                    'user_id' => $user->id,
                    'message' => trim($body),
                ]);
            }

            return $chat;
        });

        return response()->json($chat->load('messages.user:id,email'), 201);
    }
}
