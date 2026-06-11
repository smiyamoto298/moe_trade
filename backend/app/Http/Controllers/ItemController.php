<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;
use App\Models\Item;
use App\Models\Listing;
use App\Models\MarketPrice;
use App\Models\TradeHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ItemController extends Controller
{
    public function index(Request $request)
    {
        $query = Item::with(['category', 'bonusEffects', 'setMembers.category', 'setMembers.bonusEffects'])
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
        $item = Item::with([
            'category', 'bonusEffects', 'submittedBy:id,email',
            'setMembers.category', 'setMembers.bonusEffects',
        ])->findOrFail($id);
        return response()->json($item);
    }

    /**
     * アイテム名の配列を受け取り、登録済みアイテムとの一致をまとめて返す。
     * - 完全一致を優先
     * - 末尾が "..." または "…"（公式サイトの省略表記）の場合は前方一致
     * 戻り値: { data: { "<入力名>": <Item>, ... } } （一致したものだけ）
     */
    public function matchNames(Request $request)
    {
        $names = (array) $request->input('names', []);
        $result = [];

        foreach ($names as $raw) {
            if (!is_string($raw)) {
                continue;
            }
            $name = trim($raw);
            if ($name === '') {
                continue;
            }
            if (isset($result[$raw])) {
                continue;
            }

            $isTruncated = (bool) preg_match('/(\.\.\.|…)\s*$/u', $name);
            $base = trim(preg_replace('/\s*(\.\.\.|…)\s*$/u', '', $name));

            if ($isTruncated && $base !== '') {
                // LIKE のメタ文字をエスケープして前方一致
                $escaped = addcslashes($base, '%_\\');
                $item = Item::with('category')
                    ->where('name', 'like', $escaped . '%')
                    ->orderByRaw('LENGTH(name)')
                    ->orderBy('name')
                    ->first();
            } else {
                $item = Item::with('category')->where('name', $name)->first();
            }

            if ($item) {
                $result[$raw] = $item;
            }
        }

        return response()->json(['data' => (object) $result]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'category_id'              => 'required|exists:item_categories,id',
            'name'                     => 'required|string|max:200|unique:items,name',
            'description'              => 'nullable|string',
            'image_url'                => 'nullable|url|max:500',
            'base_stats'               => 'nullable|array',
            'special_conditions'       => 'nullable|array',
            'special_conditions.*'     => 'string',
            'dyeable'                  => 'nullable|boolean',
            'mithril'                  => 'nullable|boolean',
            'exclusive_skill'          => 'nullable|boolean',
            'is_equipment_set'         => 'nullable|boolean',
            'set_piece_category_ids.*' => 'integer|exists:item_categories,id',
            'skill_requirements'       => 'nullable|array',
            'skill_requirements.*'     => 'integer|min:0|max:100',
            'set_piece_category_ids'   => 'nullable|array',
            'set_piece_category_ids.*' => 'integer|exists:item_categories,id',
            'placement'                => 'nullable|in:床,壁,天井',
            'asset_width'              => 'nullable|integer|min:1|max:255',
            'asset_height'             => 'nullable|integer|min:1|max:255',
            'storage_count'            => 'nullable|integer|min:0',
            'special_function'         => 'nullable|in:販売員,銀行,タイプカプセル,栽培,生産施設,カタログ',
            'bonus_effects'            => 'nullable|array',
            'bonus_effects.*.effect_name' => 'required|string|max:200',
            'bonus_effects.*.values'      => 'nullable|array',
            'bonus_effects.*.description' => 'nullable|string',
            'bonus_effects.*.is_exclusive' => 'nullable|boolean',
            ...$this->pieceValidationRules(),
        ], [
            'name.unique' => '同じ名前のアイテムが既に登録されています。',
        ]);

        $user = $request->user();
        // 管理者が登録したアイテムは自動的に確認済みにする
        $isAdmin = $user->isAdmin();

        // 装備セットの場合: 新規セットなので既存メンバーは無し → 全 piece の id を除去（新規作成）
        if (!empty($data['is_equipment_set'])) {
            $data['pieces'] = $this->sanitizePieceIds($data['pieces'] ?? [], []);
            $this->assertPieceNamesUnique($data['pieces']);
        }

        $item = DB::transaction(function () use ($data, $user, $isAdmin) {
            $setData = collect($data)->except(['bonus_effects', 'pieces'])->toArray();
            $isSet = !empty($data['is_equipment_set']);
            // 装備セット本体は効果を持たない（部位側に持たせる）
            if ($isSet) {
                $setData['base_stats'] = [];
                $setData['set_piece_category_ids'] = [];
            }

            $item = Item::create([
                ...$setData,
                'verified_status' => $isAdmin ? 'verified' : 'unverified',
                'submitted_by'    => $user->id,
                'verified_by'     => $isAdmin ? $user->id : null,
                'verified_at'     => $isAdmin ? now() : null,
                'locked_by_staff' => $isAdmin,
            ]);

            if (!$isSet && !empty($data['bonus_effects'])) {
                foreach ($data['bonus_effects'] as $effect) {
                    $item->bonusEffects()->create($effect);
                }
                // 未登録の項目名（values[*].label）を候補テーブルに自動追加
                \App\Models\BonusValueLabel::syncFromBonusEffects($data['bonus_effects']);
            }

            if ($isSet) {
                $this->syncSetPieces($item, $data['pieces'] ?? [], $user, $isAdmin, $isAdmin);
            }

            return $item;
        });

        return response()->json(
            $item->load('bonusEffects', 'category', 'setMembers.category', 'setMembers.bonusEffects'),
            201
        );
    }

    public function update(Request $request, int $id)
    {
        $item = Item::findOrFail($id);
        $user = $request->user();

        // editor/admin は常に編集可。
        // 一般 user は「自分が登録した未確認アイテム」かつ「staff が未編集（排他制御）」の場合のみ編集可。
        $isOwnerEditable = $item->submitted_by === $user->id
            && $item->verified_status === 'unverified'
            && !$item->locked_by_staff;

        if (!$user->isEditor() && !$isOwnerEditable) {
            // 排他制御：editor/admin が手を入れたアイテムは登録者でも上書きできない
            if ($item->submitted_by === $user->id && $item->locked_by_staff) {
                abort(403, 'このアイテムは編集者または管理者によって更新されたため、編集できません。');
            }
            abort(403, 'このアイテムを編集する権限がありません。');
        }

        $data = $request->validate([
            'category_id'              => 'sometimes|exists:item_categories,id',
            'name'                     => ['sometimes', 'string', 'max:200', \Illuminate\Validation\Rule::unique('items', 'name')->ignore($item->id)],
            'description'              => 'nullable|string',
            'image_url'                => 'nullable|url|max:500',
            'base_stats'               => 'nullable|array',
            'special_conditions'       => 'nullable|array',
            'dyeable'                  => 'nullable|boolean',
            'mithril'                  => 'nullable|boolean',
            'exclusive_skill'          => 'nullable|boolean',
            'is_equipment_set'         => 'nullable|boolean',
            'set_piece_category_ids.*' => 'integer|exists:item_categories,id',
            'skill_requirements'       => 'nullable|array',
            'skill_requirements.*'     => 'integer|min:0|max:100',
            'set_piece_category_ids'   => 'nullable|array',
            'set_piece_category_ids.*' => 'integer|exists:item_categories,id',
            'placement'                => 'nullable|in:床,壁,天井',
            'asset_width'              => 'nullable|integer|min:1|max:255',
            'asset_height'             => 'nullable|integer|min:1|max:255',
            'storage_count'            => 'nullable|integer|min:0',
            'special_function'         => 'nullable|in:販売員,銀行,タイプカプセル,栽培,生産施設,カタログ',
            'bonus_effects'            => 'nullable|array',
            'bonus_effects.*.effect_name' => 'required|string|max:200',
            'bonus_effects.*.values'      => 'nullable|array',
            'bonus_effects.*.description' => 'nullable|string',
            'bonus_effects.*.is_exclusive' => 'nullable|boolean',
            ...$this->pieceValidationRules(),
        ], [
            'name.unique' => '同じ名前のアイテムが既に登録されています。',
        ]);

        $isSet = array_key_exists('pieces', $data)
            && (($data['is_equipment_set'] ?? $item->is_equipment_set));

        // 装備セットの場合: 更新できる部位は「このセットの現在のメンバー」に限定。
        // それ以外の id は除去し新規作成扱いにする（他アイテムの乗っ取り防止）。
        if ($isSet) {
            $allowedIds = $item->setMembers()->pluck('items.id')->map(fn($v) => (int) $v)->all();
            $data['pieces'] = $this->sanitizePieceIds($data['pieces'] ?? [], $allowedIds);
            $this->assertPieceNamesUnique($data['pieces']);
        }

        DB::transaction(function () use ($item, $data, $user, $isSet) {
            $isAdmin = $user->isAdmin();
            $payload = collect($data)->except(['bonus_effects', 'pieces'])->toArray();
            // editor/admin が編集したら排他ロックを立て、登録者の上書きを防ぐ
            if ($user->isEditor()) {
                $payload['locked_by_staff'] = true;
            }
            // 装備セット本体は効果を持たない
            if ($isSet) {
                $payload['base_stats'] = [];
                $payload['set_piece_category_ids'] = [];
            }
            $item->update($payload);

            if (!$isSet && isset($data['bonus_effects'])) {
                $item->bonusEffects()->delete();
                foreach ($data['bonus_effects'] as $effect) {
                    $item->bonusEffects()->create($effect);
                }
                // 未登録の項目名（values[*].label）を候補テーブルに自動追加
                \App\Models\BonusValueLabel::syncFromBonusEffects($data['bonus_effects']);
            }

            if ($isSet) {
                $this->syncSetPieces($item, $data['pieces'] ?? [], $user, $isAdmin, $user->isEditor());
            }
        });

        return response()->json(
            $item->fresh()->load('bonusEffects', 'category', 'setMembers.category', 'setMembers.bonusEffects')
        );
    }

    /**
     * 装備セットの構成部位（pieces）入力のバリデーションルール。
     * 各部位は通常アイテムとして登録される。
     */
    private function pieceValidationRules(): array
    {
        return [
            'pieces'                          => 'nullable|array',
            'pieces.*.id'                     => 'nullable|integer|exists:items,id',
            'pieces.*.category_id'            => 'required_with:pieces|integer|exists:item_categories,id',
            'pieces.*.name'                   => 'required_with:pieces|string|max:200',
            'pieces.*.base_stats'             => 'nullable|array',
            'pieces.*.special_conditions'     => 'nullable|array',
            'pieces.*.special_conditions.*'   => 'string',
            'pieces.*.dyeable'                => 'nullable|boolean',
            'pieces.*.mithril'                => 'nullable|boolean',
            'pieces.*.exclusive_skill'        => 'nullable|boolean',
            'pieces.*.bonus_effects'          => 'nullable|array',
            'pieces.*.bonus_effects.*.effect_name' => 'required|string|max:200',
            'pieces.*.bonus_effects.*.values'      => 'nullable|array',
            'pieces.*.bonus_effects.*.description' => 'nullable|string',
            'pieces.*.bonus_effects.*.is_exclusive' => 'nullable|boolean',
        ];
    }

    /**
     * 部位の id を検証する。許可リスト（＝そのセットの現在のメンバー）に無い id は
     * 他アイテムの乗っ取り防止のため除去し、新規部位として扱う。
     */
    private function sanitizePieceIds(array $pieces, array $allowedIds): array
    {
        return array_map(function ($p) use ($allowedIds) {
            if (!empty($p['id']) && !in_array((int) $p['id'], $allowedIds, true)) {
                unset($p['id']);
            }
            return $p;
        }, $pieces);
    }

    /**
     * 部位アイテム名が items.name のユニーク制約に違反しないか検証する。
     * 入力内の重複と、既存アイテム（自分自身=piece.id は除外）との衝突を検出。
     */
    private function assertPieceNamesUnique(array $pieces): void
    {
        $seen = [];
        foreach ($pieces as $i => $piece) {
            $name = trim($piece['name'] ?? '');
            if ($name === '') {
                continue;
            }
            $lower = mb_strtolower($name);
            if (isset($seen[$lower])) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "pieces.$i.name" => "部位名「{$name}」が重複しています。",
                ]);
            }
            $seen[$lower] = true;

            $exists = Item::where('name', $name)
                ->when(!empty($piece['id']), fn($q) => $q->where('id', '!=', $piece['id']))
                ->exists();
            if ($exists) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "pieces.$i.name" => "同じ名前のアイテム「{$name}」が既に登録されています。",
                ]);
            }
        }
    }

    /**
     * 装備セット本体($set)に構成部位($pieces)を同期する。
     * - id付き: 既存の部位アイテムを更新
     * - id無し: 部位アイテムを新規作成
     * - 今回送られなかった既存メンバー: セットから切り離す（部位アイテム自体は削除しない）
     * 併せてセット本体の set_piece_category_ids（部位カテゴリの派生キャッシュ）を更新する。
     *
     * @param bool $verifyOnCreate 新規部位を確認済みにするか（管理者）
     * @param bool $lockOnSave      部位に staff ロックを立てるか（editor/admin）
     */
    private function syncSetPieces(Item $set, array $pieces, $user, bool $verifyOnCreate, bool $lockOnSave): void
    {
        $sync = [];        // piece_item_id => ['sort_order' => n]
        $categoryIds = []; // 派生キャッシュ用

        foreach ($pieces as $sort => $piece) {
            $payload = [
                'category_id'        => $piece['category_id'],
                'name'               => $piece['name'],
                'base_stats'         => $piece['base_stats'] ?? [],
                'special_conditions' => $piece['special_conditions'] ?? [],
                'dyeable'            => $piece['dyeable'] ?? null,
                'mithril'            => $piece['mithril'] ?? false,
                'exclusive_skill'    => $piece['exclusive_skill'] ?? false,
                'is_equipment_set'   => false,
            ];

            if (!empty($piece['id'])) {
                $pieceItem = Item::findOrFail($piece['id']);
                if ($lockOnSave) {
                    $payload['locked_by_staff'] = true;
                }
                $pieceItem->update($payload);
            } else {
                $pieceItem = Item::create([
                    ...$payload,
                    'verified_status' => $verifyOnCreate ? 'verified' : 'unverified',
                    'submitted_by'    => $user->id,
                    'verified_by'     => $verifyOnCreate ? $user->id : null,
                    'verified_at'     => $verifyOnCreate ? now() : null,
                    'locked_by_staff' => $lockOnSave,
                ]);
            }

            // 部位の付加効果を置き換え
            $pieceItem->bonusEffects()->delete();
            if (!empty($piece['bonus_effects'])) {
                foreach ($piece['bonus_effects'] as $effect) {
                    $pieceItem->bonusEffects()->create($effect);
                }
                \App\Models\BonusValueLabel::syncFromBonusEffects($piece['bonus_effects']);
            }

            $sync[$pieceItem->id] = ['sort_order' => $sort];
            $categoryIds[] = (int) $piece['category_id'];
        }

        // ピボットを同期（送られなかった既存メンバーは detach。部位アイテム自体は残す）
        $set->setMembers()->sync($sync);

        // セット本体の派生キャッシュ（部位カテゴリ）を更新
        $set->update(['set_piece_category_ids' => array_values(array_unique($categoryIds))]);
    }

    public function verify(Request $request, int $id)
    {
        $item = Item::findOrFail($id);
        $item->update([
            'verified_status' => 'verified',
            'verified_by'     => $request->user()->id,
            'verified_at'     => now(),
            'locked_by_staff' => true,
        ]);
        return response()->json($item);
    }

    public function destroy(Request $request, int $id)
    {
        $item = Item::findOrFail($id);

        // 出品・取引履歴と紐づいている場合は、禁止せず確認を促す。
        // force=true で確認済みとして関連データごと削除する。
        $listingCount = Listing::where('item_id', $id)->count();
        $historyCount = TradeHistory::where('item_id', $id)->count();
        $hasRelated   = $listingCount > 0 || $historyCount > 0;

        if ($hasRelated && !$request->boolean('force')) {
            return response()->json([
                'requires_confirmation' => true,
                'listing_count' => $listingCount,
                'history_count' => $historyCount,
                'message' => "このアイテムには出品（{$listingCount}件）・取引履歴（{$historyCount}件）が紐づいています。\n削除すると、関連する出品・取引チャット・取引履歴もすべて削除されます。\n本当に削除してよろしいですか？",
            ], 409);
        }

        DB::transaction(function () use ($item, $id) {
            // 取引履歴（items / listings を RESTRICT 参照）を先に削除
            TradeHistory::where('item_id', $id)->delete();
            // 出品を削除（listing_servers / trade_chats / trade_messages は外部キー cascade）
            Listing::where('item_id', $id)->delete();
            // アイテム削除（item_bonus_effects は外部キー cascade）
            $item->delete();
        });

        return response()->json(null, 204);
    }

    /**
     * 重複登録されたアイテムの統合（admin）。
     * 元アイテム($id)に紐づく出品・取引履歴・相場データを統合先($targetId)へ付け替え、
     * 元アイテムを削除する。誤字等で同じアイテムが重複登録された場合のデータ修正用。
     */
    public function merge(Request $request, int $id)
    {
        $data = $request->validate([
            'target_id' => 'required|integer|exists:items,id',
        ]);
        $targetId = (int) $data['target_id'];

        if ($targetId === $id) {
            return response()->json(['message' => '同じアイテムには付け替えできません。'], 422);
        }

        $item   = Item::findOrFail($id);
        $target = Item::findOrFail($targetId);

        $result = DB::transaction(function () use ($item, $id, $targetId) {
            // 紐づくデータの item_id を統合先へ付け替える
            $listingCount    = Listing::where('item_id', $id)->update(['item_id' => $targetId]);
            $buyRequestCount = BuyRequest::where('item_id', $id)->update(['item_id' => $targetId]);
            $historyCount    = TradeHistory::where('item_id', $id)->update(['item_id' => $targetId]);
            $marketCount     = MarketPrice::where('item_id', $id)->update(['item_id' => $targetId]);

            // 付け替え済みなので、元アイテムは関連データなしで削除（item_bonus_effects は cascade）
            $item->delete();

            return compact('listingCount', 'buyRequestCount', 'historyCount', 'marketCount');
        });

        return response()->json([
            'merged_into'       => $target->only(['id', 'name']),
            'listing_count'     => $result['listingCount'],
            'buy_request_count' => $result['buyRequestCount'],
            'history_count'     => $result['historyCount'],
            'market_count'      => $result['marketCount'],
        ]);
    }

    /**
     * 他サイト等、サイト外で取引された相場情報を手動登録する（editor / admin）。
     */
    public function storeMarketPrice(Request $request, int $id)
    {
        $item = Item::findOrFail($id);

        $data = $request->validate([
            'price'     => 'required|integer|min:1',
            'currency'  => 'nullable|string|max:10',
            'server'    => 'required|in:Emerald,Diamond,Pearl',
            'traded_at' => 'required|date|before_or_equal:now',
            'note'      => 'nullable|string|max:200',
        ]);

        $entry = MarketPrice::create([
            'item_id'       => $item->id,
            'price'         => $data['price'],
            'currency'      => $data['currency'] ?? 'AC',
            'server'        => $data['server'],
            'traded_at'     => $data['traded_at'],
            'registered_by' => $request->user()->id,
            'note'          => $data['note'] ?? null,
        ]);

        return response()->json($entry, 201);
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

        // TREAT_ALL_TRADES_VALID=true のとき、同一IP取引も相場対象外にしない（全件を有効扱い）。
        // 既定は false。テストは既定値で実行されるため IP による相場除外が有効になる。
        $isLocal = config('app.treat_all_trades_valid');

        // サイト内の取引成立履歴（有効データのみ。local では全件）
        // origin: listing=出品由来（売り相場）/ buy_request=買取由来（買い相場）
        $tradeValid = TradeHistory::where('item_id', $id)
            ->when(!$isLocal, fn($q) => $q->where('is_valid', true))
            ->get(['id', 'price', 'currency', 'server', 'traded_at', 'listing_id', 'buy_request_id'])
            ->map(fn($h) => (object) [
                'id' => $h->id, 'price' => $h->price, 'currency' => $h->currency,
                'server' => $h->server, 'traded_at' => $h->traded_at, 'source' => 'trade',
                'origin' => $h->buy_request_id ? 'buy_request' : 'listing',
            ]);

        // 手動登録された他サイト相場（すべて有効データとして扱う）
        $market = MarketPrice::where('item_id', $id)
            ->get(['id', 'price', 'currency', 'server', 'traded_at'])
            ->map(fn($m) => (object) [
                'id' => $m->id, 'price' => $m->price, 'currency' => $m->currency,
                'server' => $m->server, 'traded_at' => $m->traded_at, 'source' => 'manual',
            ]);

        // 統計・グラフは有効データ（サイト内取引＋他サイト相場）をマージして算出
        $history = $tradeValid->concat($market)->sortBy('traded_at')->values();

        // 直近の取引一覧は同一IP取引（相場対象外）も含めて表示する
        $tradeAll = TradeHistory::where('item_id', $id)
            ->get(['id', 'price', 'currency', 'server', 'traded_at', 'is_valid', 'listing_id', 'buy_request_id'])
            ->map(fn($h) => (object) [
                'id' => $h->id, 'price' => $h->price, 'currency' => $h->currency,
                'server' => $h->server, 'traded_at' => $h->traded_at,
                'is_valid' => $isLocal ? true : (bool) $h->is_valid, 'source' => 'trade',
                'origin' => $h->buy_request_id ? 'buy_request' : 'listing',
            ]);
        $allDeals = $tradeAll->concat(
            $market->map(fn($m) => (object) [
                'id' => $m->id, 'price' => $m->price, 'currency' => $m->currency,
                'server' => $m->server, 'traded_at' => $m->traded_at,
                'is_valid' => true, 'source' => 'manual',
            ])
        )->sortByDesc('traded_at')->take(10)->values();

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
        $buildChart = function ($deals) use ($median) {
            return $deals->groupBy(fn($h) => $h->traded_at->toDateString())
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
        };
        $chart = $buildChart($history);

        // 直近の取引成立（新しい順・相場対象外も含む）
        $mapDeals = fn($deals) => $deals->map(fn($h) => [
            'id'        => $h->id,
            'price'     => $h->price,
            'currency'  => $h->currency,
            'server'    => $h->server,
            'traded_at' => $h->traded_at,
            'is_valid'  => (bool) $h->is_valid,
            'source'    => $h->source,
        ])->values();
        $recentDeals = $mapDeals($allDeals);

        // 現在の募集価格一覧（出品 or 買取）を整形
        $mapOffers = fn($offers) => $offers->take(10)->map(fn($o) => [
            'price'      => $o->price,
            'currency'   => $o->currency,
            'trade_type' => $o->trade_type,
            'listed_at'  => $o->created_at,
        ])->values();
        $recentListings = $mapOffers($listings);

        // ---- 売り相場（出品由来）/ 買い相場（買取由来）の分割分析 ----
        // 成立履歴を由来で分割。サイト内取引のみ（他サイト相場 manual は由来不明のため総合のみに含める）。
        $statsOf = function ($validDeals, int $offerCount) use ($median) {
            $p = $validDeals->pluck('price');
            $s = $p->sort()->values();
            $c = $s->count();
            return [
                'min'           => $c ? $p->min() : 0,
                'max'           => $c ? $p->max() : 0,
                'avg'           => $c ? (int) round($p->avg()) : 0,
                'median'        => $median($s),
                'deal_count'    => $c,
                'listing_count' => $offerCount,
            ];
        };

        // 由来別の成立履歴（local では全件、本番は is_valid のみが統計対象）
        $sellValid = $tradeValid->where('origin', 'listing')->values();
        $buyValid  = $tradeValid->where('origin', 'buy_request')->values();
        $sellAll   = $tradeAll->where('origin', 'listing')->sortByDesc('traded_at')->take(10)->values();
        $buyAll    = $tradeAll->where('origin', 'buy_request')->sortByDesc('traded_at')->take(10)->values();

        // 現在の買取募集（買取希望価格一覧）
        $buyRequests = BuyRequest::where('item_id', $id)
            ->where('status', 'active')
            ->orderByDesc('created_at')
            ->get(['price', 'currency', 'trade_type', 'created_at']);

        $sell = [
            'stats'         => $statsOf($sellValid, $listings->count()),
            'history'       => $buildChart($sellValid),
            'recent_deals'  => $mapDeals($sellAll),
            'recent_offers' => $mapOffers($listings),
        ];
        $buy = [
            'stats'         => $statsOf($buyValid, $buyRequests->count()),
            'history'       => $buildChart($buyValid),
            'recent_deals'  => $mapDeals($buyAll),
            'recent_offers' => $mapOffers($buyRequests),
        ];

        return response()->json([
            'item_id'         => $id,
            'stats'           => $stats,
            'history'         => $chart,
            'recent_deals'    => $recentDeals,
            'recent_listings' => $recentListings,
            'sell'            => $sell,
            'buy'             => $buy,
        ]);
    }
}
