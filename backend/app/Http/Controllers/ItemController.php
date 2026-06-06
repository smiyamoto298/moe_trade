<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\Listing;
use App\Models\TradeHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ItemController extends Controller
{
    public function index(Request $request)
    {
        $query = Item::with(['category', 'bonusEffects'])
            ->when($request->name, fn($q) => $q->where('name', 'like', "%{$request->name}%"))
            ->when($request->verified_status, fn($q) => $q->where('verified_status', $request->verified_status))
            ->when($request->special_conditions, function ($q) use ($request) {
                $conditions = (array) $request->special_conditions;
                foreach ($conditions as $cond) {
                    $q->whereJsonContains('special_conditions', $cond);
                }
            });

        // カテゴリ（複数）+ 装備セットを含める
        if ($request->category_id || $request->category_ids) {
            $categoryIds = $request->category_ids
                ? (array) $request->category_ids
                : [$request->category_id];
            $includeEquipmentSet = $request->boolean('include_equipment_set', false);

            $query->where(function ($q) use ($categoryIds, $includeEquipmentSet) {
                $q->whereIn('category_id', $categoryIds);
                if ($includeEquipmentSet) {
                    $q->orWhere(function ($eq) use ($categoryIds) {
                        $eq->where('is_equipment_set', true);
                        foreach ($categoryIds as $catId) {
                            $eq->whereJsonContains('set_piece_category_ids', (int) $catId);
                        }
                    });
                }
            });
        }

        // base_stats フィルター (例: ?stats[atk][min]=10&stats[atk][max]=50)
        if ($request->stats) {
            foreach ($request->stats as $key => $range) {
                if (isset($range['min'])) {
                    $query->whereRaw("JSON_EXTRACT(base_stats, '$.$key') >= ?", [$range['min']]);
                }
                if (isset($range['max'])) {
                    $query->whereRaw("JSON_EXTRACT(base_stats, '$.$key') <= ?", [$range['max']]);
                }
            }
        }

        return response()->json($query->orderBy('name')->paginate(50));
    }

    public function show(int $id)
    {
        $item = Item::with(['category', 'bonusEffects', 'submittedBy:id,email'])->findOrFail($id);
        return response()->json($item);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'category_id'              => 'required|exists:item_categories,id',
            'name'                     => 'required|string|max:200',
            'description'              => 'nullable|string',
            'image_url'                => 'nullable|url|max:500',
            'base_stats'               => 'nullable|array',
            'special_conditions'       => 'nullable|array',
            'special_conditions.*'     => 'string',
            'dyeable'                  => 'nullable|boolean',
            'mithril'                  => 'nullable|boolean',
            'is_equipment_set'         => 'nullable|boolean',
            'set_piece_category_ids.*' => 'integer|exists:item_categories,id',
            'skill_requirements'       => 'nullable|array',
            'skill_requirements.*'     => 'integer|min:0|max:100',
            'set_piece_category_ids'   => 'nullable|array',
            'set_piece_category_ids.*' => 'integer|exists:item_categories,id',
            'bonus_effects'            => 'nullable|array',
            'bonus_effects.*.effect_name' => 'required|string|max:200',
            'bonus_effects.*.values'      => 'nullable|array',
            'bonus_effects.*.description' => 'nullable|string',
        ]);

        $item = DB::transaction(function () use ($data, $request) {
            $item = Item::create([
                ...$data,
                'verified_status' => 'unverified',
                'submitted_by'    => $request->user()->id,
            ]);

            if (!empty($data['bonus_effects'])) {
                foreach ($data['bonus_effects'] as $effect) {
                    $item->bonusEffects()->create($effect);
                }
            }

            return $item;
        });

        return response()->json($item->load('bonusEffects', 'category'), 201);
    }

    public function update(Request $request, int $id)
    {
        $item = Item::findOrFail($id);
        $user = $request->user();

        // 本人は unverified 期間のみ編集可。editor/admin は常に可
        if (!$user->isEditor() && !($item->submitted_by === $user->id && $item->verified_status === 'unverified')) {
            abort(403);
        }

        $data = $request->validate([
            'category_id'              => 'sometimes|exists:item_categories,id',
            'name'                     => 'sometimes|string|max:200',
            'description'              => 'nullable|string',
            'image_url'                => 'nullable|url|max:500',
            'base_stats'               => 'nullable|array',
            'special_conditions'       => 'nullable|array',
            'dyeable'                  => 'nullable|boolean',
            'mithril'                  => 'nullable|boolean',
            'is_equipment_set'         => 'nullable|boolean',
            'set_piece_category_ids.*' => 'integer|exists:item_categories,id',
            'skill_requirements'       => 'nullable|array',
            'skill_requirements.*'     => 'integer|min:0|max:100',
            'set_piece_category_ids'   => 'nullable|array',
            'set_piece_category_ids.*' => 'integer|exists:item_categories,id',
            'bonus_effects'            => 'nullable|array',
            'bonus_effects.*.effect_name' => 'required|string|max:200',
            'bonus_effects.*.values'      => 'nullable|array',
            'bonus_effects.*.description' => 'nullable|string',
        ]);

        DB::transaction(function () use ($item, $data) {
            $item->update(collect($data)->except('bonus_effects')->toArray());

            if (isset($data['bonus_effects'])) {
                $item->bonusEffects()->delete();
                foreach ($data['bonus_effects'] as $effect) {
                    $item->bonusEffects()->create($effect);
                }
            }
        });

        return response()->json($item->fresh()->load('bonusEffects', 'category'));
    }

    public function verify(Request $request, int $id)
    {
        $item = Item::findOrFail($id);
        $item->update([
            'verified_status' => 'verified',
            'verified_by'     => $request->user()->id,
            'verified_at'     => now(),
        ]);
        return response()->json($item);
    }

    public function destroy(int $id)
    {
        Item::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    public function priceAnalytics(int $id)
    {
        $median = function ($sorted) {
            $c = $sorted->count();
            if ($c === 0) return 0;
            return $c % 2 === 0
                ? ($sorted[$c / 2 - 1] + $sorted[$c / 2]) / 2
                : $sorted[(int)($c / 2)];
        };

        // 取引成立履歴
        $history = TradeHistory::where('item_id', $id)
            ->where('is_valid', true)
            ->orderBy('traded_at')
            ->get(['id', 'price', 'currency', 'server', 'traded_at']);

        // 現在の出品（出品中の価格一覧・出品数）
        $listings = Listing::where('item_id', $id)
            ->where('status', 'active')
            ->orderByDesc('created_at')
            ->get(['price', 'currency', 'trade_type', 'created_at']);

        $prices = $history->pluck('price');
        $sorted = $prices->sort()->values();
        $count  = $sorted->count();

        $stats = [
            'min'           => $count ? $prices->min() : 0,
            'max'           => $count ? $prices->max() : 0,
            'avg'           => $count ? (int) round($prices->avg()) : 0,
            'median'        => $median($sorted),
            'deal_count'    => $count,
            'listing_count' => $listings->count(),
        ];

        // 日次グラフデータ（recharts 用）
        $chart = $history->groupBy(fn($h) => $h->traded_at->toDateString())
            ->map(function ($group) use ($median) {
                $p = $group->pluck('price');
                $s = $p->sort()->values();
                return [
                    'date'   => $group->first()->traded_at->toDateString(),
                    'min'    => $p->min(),
                    'max'    => $p->max(),
                    'avg'    => (int) round($p->avg()),
                    'median' => $median($s),
                    'count'  => $p->count(),
                ];
            })->values();

        // 直近の取引成立（新しい順）
        $recentDeals = $history->sortByDesc('traded_at')->take(10)->values()->map(fn($h) => [
            'id'        => $h->id,
            'price'     => $h->price,
            'currency'  => $h->currency,
            'server'    => $h->server,
            'traded_at' => $h->traded_at,
        ]);

        // 出品中の価格一覧
        $recentListings = $listings->take(10)->map(fn($l) => [
            'price'      => $l->price,
            'currency'   => $l->currency,
            'trade_type' => $l->trade_type,
            'listed_at'  => $l->created_at,
        ])->values();

        return response()->json([
            'item_id'         => $id,
            'stats'           => $stats,
            'history'         => $chart,
            'recent_deals'    => $recentDeals,
            'recent_listings' => $recentListings,
        ]);
    }
}
