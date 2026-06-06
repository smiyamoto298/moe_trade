<?php

namespace App\Http\Controllers;

use App\Models\Listing;
use App\Models\ListingServer;
use App\Models\TradeChat;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ListingController extends Controller
{
    public function index(Request $request)
    {
        $includeCompleted = $request->boolean('include_completed', false);
        $statuses = $includeCompleted ? ['active', 'completed'] : ['active'];

        $query = Listing::with(['item.category', 'item.bonusEffects', 'user:id,email', 'servers.character'])
            ->whereIn('status', $statuses)
            ->whereHas('user', fn($q) => $q->where('is_suspended', false));

        // スキル / 装備品フィルター
        if ($request->has('is_skill')) {
            $isSkill = $request->boolean('is_skill');
            $query->whereHas('item.category', function ($cq) use ($isSkill) {
                if ($isSkill) {
                    // 親カテゴリ名が「スキル」のものを対象
                    $cq->whereHas('parent', fn($pq) => $pq->where('name', 'スキル'))
                       ->orWhere('name', 'スキル');
                } else {
                    // 親カテゴリ名が「スキル」以外
                    $cq->where(function ($inner) {
                        $inner->whereDoesntHave('parent')
                              ->where('name', '!=', 'スキル');
                    })->orWhereHas('parent', fn($pq) => $pq->where('name', '!=', 'スキル'));
                }
            });
        }

        // フィルター
        $query->when($request->item_name, fn($q) =>
            $q->whereHas('item', fn($iq) => $iq->where('name', 'like', "%{$request->item_name}%"))
        );
        // カテゴリ（複数）+ 装備セットを含める
        if ($request->category_id || $request->category_ids) {
            $categoryIds = $request->category_ids
                ? (array) $request->category_ids
                : [$request->category_id];
            $includeEquipmentSet = $request->boolean('include_equipment_set', false);

            $query->whereHas('item', function ($iq) use ($categoryIds, $includeEquipmentSet) {
                $iq->where(function ($inner) use ($categoryIds, $includeEquipmentSet) {
                    $inner->whereIn('category_id', $categoryIds);
                    if ($includeEquipmentSet) {
                        $inner->orWhere(function ($eq) use ($categoryIds) {
                            $eq->where('is_equipment_set', true);
                            foreach ($categoryIds as $catId) {
                                $eq->whereJsonContains('set_piece_category_ids', (int) $catId);
                            }
                        });
                    }
                });
            });
        }

        // 追加効果（base_stats）フィルター
        // チェックされたキーは値の有無に関わらず「そのキーが存在する」ことを必須条件とする
        if ($request->base_stat_keys) {
            foreach ((array) $request->base_stat_keys as $key) {
                $query->whereHas('item', function ($iq) use ($key) {
                    $iq->whereRaw("JSON_EXTRACT(base_stats, '$.$key') IS NOT NULL")
                       ->whereRaw("CAST(JSON_EXTRACT(base_stats, '$.$key') AS DECIMAL(15,4)) != 0");
                });
            }
        }
        // 数値範囲指定がある場合はさらに絞り込む
        if ($request->base_stat_ranges) {
            foreach ($request->base_stat_ranges as $key => $range) {
                $query->whereHas('item', function ($iq) use ($key, $range) {
                    $min = $range['min'] ?? '';
                    $max = $range['max'] ?? '';
                    if ($min !== '' && $min !== null) {
                        $iq->whereRaw(
                            "CAST(JSON_EXTRACT(base_stats, '$.$key') AS DECIMAL(15,4)) >= ?",
                            [(float) $min]
                        );
                    }
                    if ($max !== '' && $max !== null) {
                        $iq->whereRaw(
                            "CAST(JSON_EXTRACT(base_stats, '$.$key') AS DECIMAL(15,4)) <= ?",
                            [(float) $max]
                        );
                    }
                });
            }
        }

        // 付加効果フィルター（effect_nameで絞り込み、AND条件）
        if ($request->bonus_effect_names) {
            foreach ((array) $request->bonus_effect_names as $name) {
                $query->whereHas('item.bonusEffects', function ($bq) use ($name) {
                    $bq->where('effect_name', $name);
                });
            }
        }

        // 付加効果の数値ラベルフィルター（bonus_value_keys: チェック済みラベル, bonus_value_ranges: 数値範囲）
        if ($request->bonus_value_keys) {
            foreach ((array) $request->bonus_value_keys as $label) {
                $range = $request->bonus_value_ranges[$label] ?? [];
                $min   = $range['min'] ?? '';
                $max   = $range['max'] ?? '';

                $query->whereHas('item.bonusEffects', function ($bq) use ($label, $min, $max) {
                    if ($min !== '' || $max !== '') {
                        // 数値範囲あり: JSON_TABLE で同一要素のラベル＋値を一緒にチェック
                        $bq->whereRaw("EXISTS (
                            SELECT 1 FROM JSON_TABLE(`values`, '\$[*]'
                                COLUMNS (lbl VARCHAR(200) PATH '\$.label', val DECIMAL(15,4) PATH '\$.value')
                            ) AS jt
                            WHERE jt.lbl = ?
                            " . ($min !== '' ? "AND jt.val >= " . (float)$min : "") . "
                            " . ($max !== '' ? "AND jt.val <= " . (float)$max : "") . "
                        )", [$label]);
                    } else {
                        // ラベル存在チェックのみ
                        $bq->whereRaw(
                            "JSON_SEARCH(`values`, 'one', ?, NULL, '\$[*].label') IS NOT NULL",
                            [$label]
                        );
                    }
                });
            }
        }

        $query->when($request->trade_type, fn($q) => $q->where('trade_type', $request->trade_type));
        $query->when($request->min_price, fn($q) => $q->where('price', '>=', $request->min_price));
        $query->when($request->max_price, fn($q) => $q->where('price', '<=', $request->max_price));

        if ($request->servers) {
            $servers = (array) $request->servers;
            $query->whereHas('servers', fn($q) => $q->whereIn('server', $servers));
        }

        // ソート
        $sort = $request->sort ?? 'newest';
        if (str_starts_with($sort, 'stat_asc:') || str_starts_with($sort, 'stat_desc:')) {
            // 追加効果の数値でソート（例: stat_asc:atk）
            $dir = str_starts_with($sort, 'stat_asc:') ? 'ASC' : 'DESC';
            $key = substr($sort, strpos($sort, ':') + 1);
            $query->join('items as sort_item', 'listings.item_id', '=', 'sort_item.id')
                  ->orderByRaw("CAST(JSON_EXTRACT(sort_item.base_stats, '$.$key') AS DECIMAL(15,4)) $dir NULLS LAST")
                  ->select('listings.*');
        } elseif (str_starts_with($sort, 'bonus_asc:') || str_starts_with($sort, 'bonus_desc:')) {
            // 付加効果の数値ラベルでソート（例: bonus_asc:物理ダメージ）
            $dir   = str_starts_with($sort, 'bonus_asc:') ? 'ASC' : 'DESC';
            $label = substr($sort, strpos($sort, ':') + 1);
            $query->leftJoin('item_bonus_effects as sort_ibe', 'listings.item_id', '=', 'sort_ibe.item_id')
                  ->orderByRaw("(
                      SELECT CAST(jt.val AS DECIMAL(15,4))
                      FROM JSON_TABLE(sort_ibe.`values`, '\$[*]'
                          COLUMNS (lbl VARCHAR(200) PATH '\$.label', val DECIMAL(15,4) PATH '\$.value')
                      ) AS jt WHERE jt.lbl = ? LIMIT 1
                  ) $dir NULLS LAST", [$label])
                  ->select('listings.*')
                  ->distinct();
        } else {
            match ($sort) {
                'price_asc'  => $query->orderBy('price'),
                'price_desc' => $query->orderByDesc('price'),
                default      => $query->latest(),
            };
        }

        return response()->json($query->paginate(20));
    }

    public function show(int $id)
    {
        $listing = Listing::with(['item.category', 'item.bonusEffects', 'user:id,email', 'servers.character'])
            ->findOrFail($id);
        return response()->json($listing);
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
            'price'      => 'required|integer|min:0',
            'quantity'   => 'required|integer|min:1',
            'trade_type' => 'required|in:fixed,negotiable',
            'comment'    => 'nullable|string|max:1000',
            'servers'    => 'required|array|min:1',
            'servers.*.server'       => 'required|in:Emerald,Diamond,Pearl',
            'servers.*.character_id' => 'nullable|exists:user_characters,id',
        ]);

        $listing = DB::transaction(function () use ($data, $user) {
            $listing = Listing::create([
                'user_id'    => $user->id,
                'item_id'    => $data['item_id'],
                'price'      => $data['price'],
                'quantity'   => $data['quantity'],
                'trade_type' => $data['trade_type'],
                'comment'    => $data['comment'] ?? null,
                'currency'   => 'AC',
                'expires_at' => now()->addDays(7),
            ]);

            foreach ($data['servers'] as $srv) {
                ListingServer::create([
                    'listing_id'   => $listing->id,
                    'server'       => $srv['server'],
                    'character_id' => $srv['character_id'] ?? null,
                ]);
            }

            return $listing;
        });

        return response()->json($listing->load('item', 'servers'), 201);
    }

    public function update(Request $request, int $id)
    {
        $listing = Listing::findOrFail($id);
        $this->authorize('update', $listing);

        $data = $request->validate([
            'price'      => 'sometimes|integer|min:0',
            'quantity'   => 'sometimes|integer|min:1',
            'trade_type' => 'sometimes|in:fixed,negotiable',
            'comment'    => 'nullable|string|max:1000',
            'servers'    => 'sometimes|array|min:1',
            'servers.*.server'       => 'required|in:Emerald,Diamond,Pearl',
            'servers.*.character_id' => 'nullable|exists:user_characters,id',
        ]);

        DB::transaction(function () use ($listing, $data) {
            $listing->update(collect($data)->except('servers')->toArray());

            if (isset($data['servers'])) {
                $listing->servers()->delete();
                foreach ($data['servers'] as $srv) {
                    ListingServer::create([
                        'listing_id'   => $listing->id,
                        'server'       => $srv['server'],
                        'character_id' => $srv['character_id'] ?? null,
                    ]);
                }
            }
        });

        return response()->json($listing->fresh()->load('item', 'servers'));
    }

    public function destroy(Request $request, int $id)
    {
        $listing = Listing::findOrFail($id);
        $user = $request->user();

        if ($listing->user_id !== $user->id && !$user->isAdmin()) {
            abort(403);
        }

        $listing->update(['status' => 'cancelled']);
        return response()->json(null, 204);
    }

    public function renew(Request $request, int $id)
    {
        $listing = Listing::where('user_id', $request->user()->id)->findOrFail($id);
        $listing->update([
            'status'     => 'active',
            'expires_at' => now()->addDays(7),
        ]);
        return response()->json($listing);
    }

    public function chats(Request $request, int $id)
    {
        $listing = Listing::findOrFail($id);

        if ($listing->user_id !== $request->user()->id) {
            abort(403);
        }

        $chats = $listing->chats()->with(['buyer:id,email', 'messages.user:id,email'])->get();
        return response()->json($chats);
    }

    public function createChat(Request $request, int $id)
    {
        $user = $request->user();

        if (!$user->hasVerifiedEmail()) {
            return response()->json(['message' => 'メール認証が必要です。'], 403);
        }

        $listing = Listing::findOrFail($id);

        if ($listing->status !== 'active') {
            return response()->json(['message' => 'この出品は取引できません。'], 400);
        }
        if ($listing->user_id === $user->id) {
            return response()->json(['message' => '自分の出品には取引希望できません。'], 400);
        }

        $data = $request->validate([
            'server'         => 'required|in:Emerald,Diamond,Pearl',
            'preferred_time' => 'nullable|string|max:200',
            'note'           => 'nullable|string|max:1000',
        ]);

        // 既存オープンチャットがあれば返す
        $existing = TradeChat::where('listing_id', $id)
            ->where('buyer_id', $user->id)
            ->where('status', 'open')
            ->first();

        if ($existing) {
            return response()->json($existing->load('messages.user:id,email'), 200);
        }

        $chat = DB::transaction(function () use ($listing, $user, $data) {
            $chat = TradeChat::create([
                'listing_id' => $listing->id,
                'buyer_id'   => $user->id,
                'server'     => $data['server'],
            ]);

            // 最初のメッセージ（希望時間帯・備考）
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
