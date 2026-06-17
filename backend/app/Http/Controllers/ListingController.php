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

        $query = Listing::with(['item.category', 'item.bonusEffects', 'item.hashtags', 'item.setMembers.category', 'item.setMembers.bonusEffects', 'user:id,email', 'user.characters', 'servers'])
            ->visible($statuses)
            ->whereHas('user', fn($q) => $q->where('is_suspended', false));

        // 種別フィルター（装備品 / テクニック / アセット）
        // item_type を優先。未指定なら後方互換で is_skill を解釈する。
        $itemType = $request->item_type;
        if (!$itemType && $request->has('is_skill')) {
            $itemType = $request->boolean('is_skill') ? 'technique' : 'equipment';
        }
        $this->applyItemTypeFilter($query, $itemType);

        // フィルター
        $query->when($request->item_name, fn($q) =>
            $q->whereHas('item', fn($iq) => $iq->where('name', 'like', "%{$request->item_name}%"))
        );
        // ハッシュタグでの絞り込み（タグ名は完全一致・大文字小文字を無視）
        $query->when($request->filled('hashtag'), function ($q) use ($request) {
            $tag = mb_strtolower(trim((string) $request->hashtag));
            $q->whereHas('item.hashtags', fn($hq) => $hq->whereRaw('LOWER(tag) = ?', [$tag]));
        });
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
        // チェックされたキーは値の有無に関わらず「そのキーが存在する」ことを必須条件とする。
        // 装備セットは本体に効果を持たないため、構成部位（setMembers）のいずれかが条件を満たせば一致とする。
        if ($request->base_stat_keys) {
            foreach ((array) $request->base_stat_keys as $key) {
                // キーは JSON パスへ文字列補間するため、既知キーのみ許可（インジェクション防止）
                if (!is_string($key) || !\App\Support\Stats::isValidKey($key)) {
                    continue;
                }
                $cond = function ($q) use ($key) {
                    $q->whereRaw("JSON_EXTRACT(base_stats, '$.$key') IS NOT NULL")
                      ->whereRaw("CAST(JSON_EXTRACT(base_stats, '$.$key') AS DECIMAL(15,4)) != 0");
                };
                $query->whereHas('item', fn($iq) =>
                    $iq->where(fn($w) => $w->where($cond)->orWhereHas('setMembers', $cond))
                );
            }
        }
        // 数値範囲指定がある場合はさらに絞り込む（セットは構成部位のいずれかが範囲内なら一致）
        if ($request->base_stat_ranges) {
            foreach ($request->base_stat_ranges as $key => $range) {
                // キーは JSON パスへ文字列補間するため、既知キーのみ許可（インジェクション防止）
                if (!is_string($key) || !\App\Support\Stats::isValidKey($key)) {
                    continue;
                }
                $min = $range['min'] ?? '';
                $max = $range['max'] ?? '';
                if (($min === '' || $min === null) && ($max === '' || $max === null)) {
                    continue;
                }
                $cond = function ($q) use ($key, $min, $max) {
                    if ($min !== '' && $min !== null) {
                        $q->whereRaw("CAST(JSON_EXTRACT(base_stats, '$.$key') AS DECIMAL(15,4)) >= ?", [(float) $min]);
                    }
                    if ($max !== '' && $max !== null) {
                        $q->whereRaw("CAST(JSON_EXTRACT(base_stats, '$.$key') AS DECIMAL(15,4)) <= ?", [(float) $max]);
                    }
                };
                $query->whereHas('item', fn($iq) =>
                    $iq->where(fn($w) => $w->where($cond)->orWhereHas('setMembers', $cond))
                );
            }
        }

        // 必要スキル値フィルター（スキルタブ用）
        // skill_match で検索モードを切り替える:
        //   normal（既定・通常検索）= 指定したスキルを（すべて）必要スキルに含むテクニックを表示
        //   composition（構成検索）  = マスタリの構成スキルを含む必要スキルが、すべて検索条件に入っているテクニックを表示
        if ($request->skill_keys) {
            $selectedSkills = array_values((array) $request->skill_keys);
            $composition    = $request->skill_match === 'composition';
            $skillRanges    = $request->skill_ranges ?? [];

            // JSONパス（スキル名は日本語のためバインドで渡す。インジェクション防止）
            $jsonPath = fn($key) => '$."' . str_replace(['"', '\\'], '', $key) . '"';

            if (!$composition) {
                // 通常検索: 指定したスキルをすべて必要スキルに含む（AND）。範囲指定でさらに絞り込む。
                // skill_include_mastery が真なら、そのスキルを構成に含むマスタリを必要とするテクニックも対象に含める。
                $includeMastery = $request->boolean('skill_include_mastery');

                foreach ($selectedSkills as $key) {
                    $path = $jsonPath($key);
                    $r    = $skillRanges[$key] ?? [];
                    $min  = $r['min'] ?? '';
                    $max  = $r['max'] ?? '';

                    // このスキルを構成に含むマスタリ（範囲指定が40を許容する場合のみ。マスタリは構成スキルを全て40で発動）
                    $masteryCodes = [];
                    if ($includeMastery) {
                        $permits40 = ($min === '' || $min === null || (float) $min <= 40)
                            && ($max === '' || $max === null || (float) $max >= 40);
                        if ($permits40) {
                            $masteryCodes = \App\Support\Mastery::codesForSkill($key);
                        }
                    }

                    $query->whereHas('item', function ($iq) use ($path, $min, $max, $masteryCodes) {
                        $iq->where(function ($w) use ($path, $min, $max, $masteryCodes) {
                            // 必要スキル値による一致
                            $w->where(function ($sq) use ($path, $min, $max) {
                                $sq->whereRaw('JSON_EXTRACT(skill_requirements, ?) IS NOT NULL', [$path]);
                                if ($min !== '' && $min !== null) {
                                    $sq->whereRaw('CAST(JSON_EXTRACT(skill_requirements, ?) AS DECIMAL(15,4)) >= ?', [$path, (float) $min]);
                                }
                                if ($max !== '' && $max !== null) {
                                    $sq->whereRaw('CAST(JSON_EXTRACT(skill_requirements, ?) AS DECIMAL(15,4)) <= ?', [$path, (float) $max]);
                                }
                            });
                            // 必要マスタリによる一致（このスキルを構成に含むマスタリ）
                            if (!empty($masteryCodes)) {
                                $w->orWhere(function ($mq) use ($masteryCodes) {
                                    foreach ($masteryCodes as $i => $code) {
                                        $i === 0
                                            ? $mq->whereJsonContains('mastery_requirements', $code)
                                            : $mq->orWhereJsonContains('mastery_requirements', $code);
                                    }
                                });
                            }
                        });
                    });
                }
            } else {
                // 構成検索: アイテムの必要スキル + 必要マスタリの構成スキルが、すべて選択スキルに含まれる（部分集合）。

                // 範囲指定が 40 を許容するスキルだけマスタリ判定に使う（マスタリは構成スキルを全て40で発動）
                $permits40 = function (string $key) use ($skillRanges): bool {
                    $r   = $skillRanges[$key] ?? [];
                    $min = $r['min'] ?? '';
                    $max = $r['max'] ?? '';
                    return ($min === '' || $min === null || (float) $min <= 40)
                        && ($max === '' || $max === null || (float) $max >= 40);
                };
                $masterySkills = array_values(array_filter($selectedSkills, $permits40));

                $query->whereHas('item', function ($iq) use ($selectedSkills, $skillRanges, $masterySkills, $jsonPath) {
                    // 必要スキル: 選択されていないスキルを必要としない（部分集合チェック）
                    $notSelected = array_values(array_diff(\App\Support\Skills::ALL, $selectedSkills));
                    foreach ($notSelected as $u) {
                        $iq->whereRaw('JSON_EXTRACT(skill_requirements, ?) IS NULL', [$jsonPath($u)]);
                    }
                    // 範囲指定があるスキルは、必要とする場合に値が範囲内であること
                    foreach ($selectedSkills as $key) {
                        $r = $skillRanges[$key] ?? [];
                        $min = $r['min'] ?? '';
                        $max = $r['max'] ?? '';
                        if (($min === '' || $min === null) && ($max === '' || $max === null)) {
                            continue;
                        }
                        $path = $jsonPath($key);
                        $iq->where(function ($c) use ($path, $min, $max) {
                            $c->whereRaw('JSON_EXTRACT(skill_requirements, ?) IS NULL', [$path]);
                            $c->orWhere(function ($d) use ($path, $min, $max) {
                                if ($min !== '' && $min !== null) {
                                    $d->whereRaw('CAST(JSON_EXTRACT(skill_requirements, ?) AS DECIMAL(15,4)) >= ?', [$path, (float) $min]);
                                }
                                if ($max !== '' && $max !== null) {
                                    $d->whereRaw('CAST(JSON_EXTRACT(skill_requirements, ?) AS DECIMAL(15,4)) <= ?', [$path, (float) $max]);
                                }
                            });
                        });
                    }
                    // 必要マスタリ: 構成スキルが全て選択されていない（＝完全被覆でない）マスタリを必要としない。
                    // マスタリ未設定（NULL）のテクニックはこの条件を満たす（MySQL の JSON_CONTAINS は
                    // NULL 列に対して NULL を返し WHERE で除外されてしまうため、明示的に NULL を許可する）。
                    $covered    = \App\Support\Mastery::fullyCoveredCodes($masterySkills);
                    $notCovered = array_values(array_diff(\App\Support\Mastery::codes(), $covered));
                    $iq->where(function ($mw) use ($notCovered) {
                        $mw->whereNull('mastery_requirements')
                           ->orWhere(function ($m2) use ($notCovered) {
                               foreach ($notCovered as $code) {
                                   $m2->whereJsonDoesntContain('mastery_requirements', $code);
                               }
                           });
                    });
                });
            }
        }

        // 特殊条件フィルター（選択された条件をすべて持つアイテムに絞り込み、AND条件）
        // 装備セットは構成部位のいずれかが条件を持てば一致とする。
        if ($request->special_conditions) {
            foreach ((array) $request->special_conditions as $cond) {
                $apply = fn($q) => $q->whereJsonContains('special_conditions', $cond);
                $query->whereHas('item', fn($iq) =>
                    $iq->where(fn($w) => $w->where($apply)->orWhereHas('setMembers', $apply))
                );
            }
        }

        // 設置個所フィルター（アセット・OR条件）
        if ($request->placements) {
            $query->whereHas('item', fn($iq) => $iq->whereIn('placement', (array) $request->placements));
        }

        // 特殊機能フィルター（アセット・OR条件）
        if ($request->special_functions) {
            $query->whereHas('item', fn($iq) => $iq->whereIn('special_function', (array) $request->special_functions));
        }

        // ストレージ数の範囲（アセット）
        if ($request->filled('storage_min')) {
            $query->whereHas('item', fn($iq) => $iq->where('storage_count', '>=', (int) $request->storage_min));
        }
        if ($request->filled('storage_max')) {
            $query->whereHas('item', fn($iq) => $iq->where('storage_count', '<=', (int) $request->storage_max));
        }

        // 付加効果フィルター（effect_nameで絞り込み、AND条件）
        // 装備セットは構成部位（setMembers）の付加効果も対象にする。
        if ($request->bonus_effect_names) {
            foreach ((array) $request->bonus_effect_names as $name) {
                $cond = fn($bq) => $bq->where('effect_name', $name);
                $query->whereHas('item', fn($iq) =>
                    $iq->where(fn($w) =>
                        $w->whereHas('bonusEffects', $cond)->orWhereHas('setMembers.bonusEffects', $cond)
                    )
                );
            }
        }

        // 付加効果の数値ラベルフィルター（bonus_value_keys: チェック済みラベル, bonus_value_ranges: 数値範囲）
        if ($request->bonus_value_keys) {
            foreach ((array) $request->bonus_value_keys as $label) {
                $range = $request->bonus_value_ranges[$label] ?? [];
                $min   = $range['min'] ?? '';
                $max   = $range['max'] ?? '';

                $cond = function ($bq) use ($label, $min, $max) {
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
                };
                $query->whereHas('item', fn($iq) =>
                    $iq->where(fn($w) =>
                        $w->whereHas('bonusEffects', $cond)->orWhereHas('setMembers.bonusEffects', $cond)
                    )
                );
            }
        }

        $query->when($request->trade_type, fn($q) => $q->where('trade_type', $request->trade_type));
        // 「削れありを非表示」
        if ($request->boolean('exclude_worn')) {
            $query->where('is_worn', false);
        }
        // 価格帯（フロントは price_min/price_max、旧形式 min_price/max_price も受け付ける）
        $minPrice = $request->price_min ?? $request->min_price;
        $maxPrice = $request->price_max ?? $request->max_price;
        $query->when($minPrice, fn($q) => $q->where('price', '>=', $minPrice));
        $query->when($maxPrice, fn($q) => $q->where('price', '<=', $maxPrice));

        if ($request->servers) {
            $servers = (array) $request->servers;
            $query->whereHas('servers', fn($q) => $q->whereIn('server', $servers));
        }

        // ソート
        $sort = $request->sort ?? 'newest';
        if ((str_starts_with($sort, 'stat_asc:') || str_starts_with($sort, 'stat_desc:'))
            && \App\Support\Stats::isValidKey(substr($sort, strpos($sort, ':') + 1))) {
            // 追加効果の数値でソート（例: stat_asc:atk）。キーは既知のもののみ（インジェクション防止）。
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
        } elseif ($sort === 'name_asc' || $sort === 'name_desc') {
            // アイテム名（あいうえお順）。かなは符号位置順で概ね五十音順になる。
            $dir = $sort === 'name_asc' ? 'ASC' : 'DESC';
            $query->join('items as sort_item_name', 'listings.item_id', '=', 'sort_item_name.id')
                  ->orderBy('sort_item_name.name', $dir)
                  ->select('listings.*');
        } else {
            match ($sort) {
                'price_asc'  => $query->orderBy('price'),
                'price_desc' => $query->orderByDesc('price'),
                default      => $query->latest(),
            };
        }

        // 現在の取引希望者数（順番待ち人数）。一覧の取引パネルで「N人待ち」を表示するのに使う。
        // ソート分岐の select('listings.*') で消えないよう、ここで addSelect する。
        $query->withCount(['chats as waiting_count' => fn($q) => $q->where('status', 'open')]);

        $result = $query->paginate(20);
        // 連絡先キャラ名を出品者の現在のキャラクターで解決
        $result->getCollection()->each(fn(Listing $l) => $l->resolveServerContacts());

        return response()->json($result);
    }

    /**
     * 種別（装備品 / テクニック / アセット / その他）でクエリを絞り込む。
     * アイテムのトップカテゴリ名（子カテゴリは親名、トップ自身はその名前）で判定する。
     */
    private function applyItemTypeFilter($query, ?string $itemType): void
    {
        if (!$itemType) {
            return;
        }
        // 対象のトップカテゴリ名と包含/除外を決定
        [$names, $include] = match ($itemType) {
            'technique' => [['テクニック'], true],
            'asset'     => [['アセット'], true],
            'other'     => [['その他'], true],
            // equipment: テクニック・アセット・その他のいずれでもないもの
            default     => [['テクニック', 'アセット', 'その他'], false],
        };

        $query->whereHas('item.category', function ($cq) use ($names, $include) {
            $cq->where(function ($q) use ($names, $include) {
                $q->whereHas('parent', function ($pq) use ($names, $include) {
                    $include ? $pq->whereIn('name', $names) : $pq->whereNotIn('name', $names);
                })->orWhere(function ($q2) use ($names, $include) {
                    $q2->whereDoesntHave('parent');
                    $include ? $q2->whereIn('name', $names) : $q2->whereNotIn('name', $names);
                });
            });
        });
    }

    /**
     * 種別タブに表示する各種別の出品件数。
     * 一覧と同じ公開条件（出品中／取引成立・凍結ユーザー除外）で集計する。
     * include_completed は一覧と揃えるが、その他の絞り込みは反映しない（タブの総件数）。
     */
    public function counts(Request $request)
    {
        $includeCompleted = $request->boolean('include_completed', false);
        $statuses = $includeCompleted ? ['active', 'completed'] : ['active'];

        $counts = [];
        foreach (['equipment', 'technique', 'asset', 'other'] as $type) {
            $query = Listing::visible($statuses)
                ->whereHas('user', fn($q) => $q->where('is_suspended', false));
            $this->applyItemTypeFilter($query, $type);
            $counts[$type] = $query->count();
        }

        return response()->json($counts);
    }

    public function show(int $id)
    {
        // 公開対象（出品中・取引成立）のみ閲覧可。取り下げ・期限切れ等は404。
        // active は期限内のものだけ（バッチ未実行で active のまま期限超過したものも404にする）。
        $listing = Listing::with(['item.category', 'item.bonusEffects', 'item.setMembers.category', 'item.setMembers.bonusEffects', 'user:id,email', 'user.characters', 'servers'])
            ->visible(['active', 'completed'])
            ->findOrFail($id);
        $listing->resolveServerContacts();
        // 現在の取引希望者数（順番待ち人数）。「この取引はN人待ちです」の表示に使う。
        $listing->waiting_count = $listing->chats()->where('status', 'open')->count();
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
            'price'      => 'required|integer|min:1',
            'quantity'   => 'required|integer|min:1',
            'trade_type' => 'required|in:fixed,negotiable',
            'comment'    => 'nullable|string|max:1000',
            'is_worn'    => 'nullable|boolean',
            'is_dyed'    => 'nullable|boolean',
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
                'is_worn'    => $data['is_worn'] ?? false,
                'is_dyed'    => $data['is_dyed'] ?? false,
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
            'price'      => 'sometimes|integer|min:1',
            'quantity'   => 'sometimes|integer|min:1',
            'trade_type' => 'sometimes|in:fixed,negotiable',
            'comment'    => 'nullable|string|max:1000',
            'is_worn'    => 'sometimes|boolean',
            'is_dyed'    => 'sometimes|boolean',
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

        if ($listing->status !== 'active' || ($listing->expires_at && $listing->expires_at->isPast())) {
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

        $requestIp = $request->ip(); // 取引希望を送信したIP
        $chat = DB::transaction(function () use ($listing, $user, $data, $requestIp) {
            // 取引希望を受けた出品の残りが3日以下なら、残り4日まで延長する
            if ($listing->expires_at && $listing->expires_at->lte(now()->addDays(3))) {
                $listing->update(['expires_at' => now()->addDays(4)]);
            }

            $chat = TradeChat::create([
                'listing_id' => $listing->id,
                'buyer_id'   => $user->id,
                'server'     => $data['server'],
                'request_ip' => $requestIp,
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
