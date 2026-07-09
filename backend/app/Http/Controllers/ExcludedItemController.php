<?php

namespace App\Http\Controllers;

use App\Models\DismissedExcludedSuggestion;
use App\Models\ExcludedItem;
use App\Models\ExclusionType;
use App\Models\ReportedExcludedName;
use App\Models\UserExcludedItem;
use Illuminate\Http\Request;

/**
 * 管理者が登録する共通の除外アイテム（アイテム名・文字列単位）。
 * 所持品管理・一括出品の貼り付けで、ここに登録された名前を除外する。
 */
class ExcludedItemController extends Controller
{
    /**
     * 公開: 共通除外アイテムと種別。貼り付け除外に使用（ローカル保存ユーザーも取得する）。
     *
     * 戻り値: { types: [{ id, name, is_default, default_enabled, sort_order }], items: [{ name, type_id }] }。
     * クライアントは「適用する種別」（端末ローカル設定）で items を絞り込んで除外セットを作る。
     * 未設定ユーザーは default_enabled=true の種別だけが既定で適用される。
     * type_id が null の行は既定種別 id に正規化する。
     */
    public function index()
    {
        $types = ExclusionType::orderBy('sort_order')->orderBy('name')
            ->get(['id', 'name', 'is_default', 'default_enabled', 'sort_order']);
        $defaultId = $types->firstWhere('is_default', true)?->id;

        $items = ExcludedItem::orderBy('name')
            ->get(['name', 'exclusion_type_id'])
            ->map(fn ($i) => [
                'name'    => $i->name,
                'type_id' => $i->exclusion_type_id ?? $defaultId,
            ])
            ->values();

        return response()->json(['types' => $types, 'items' => $items]);
    }

    /** 管理: 全件（id 付き）。管理画面用。 */
    public function adminIndex()
    {
        return response()->json(ExcludedItem::orderBy('name')->get());
    }

    /**
     * 管理: ユーザーが個別に設定した種別を名前で集計して、共通の種別割当への昇格（共通化）候補を返す。
     *
     * 2種類の候補を返す:
     *  - 新規候補: まだ共通登録されていない名前。DB保存ユーザー分（user_excluded_items）は設定人数を
     *    集計し、端末（ローカルストレージ）保存ユーザー分（reported_excluded_names・匿名報告）は名前を
     *    `from_device` 付きで合流させる（端末分は人数を持たないため presence のみ）。
     *  - 上書き候補: 既に共通登録済みだが、現在の共通種別と**異なる種別**を設定したユーザーがいる名前
     *    （`current_type_id` に現在の共通種別を入れて返す）。同じ種別しか設定されていなければ候補にしない。
     *
     * 各候補には、ユーザーが設定した種別の内訳 `type_assignments`（多い順・`type_id` は null=その他）と、
     * 共通化時の既定候補 `suggested_type_id`（最頻の種別。上書き候補は現在と異なる最頻種別）を付ける。
     * 管理者が「共通にしない」と却下した名前（dismissed_excluded_suggestions）は除く。
     *
     * 戻り値: [{ name, user_count, from_device, current_type_id, suggested_type_id, type_assignments }]
     *（user_count 降順 → name 昇順）。
     */
    public function userSuggestions()
    {
        $defaultId = ExclusionType::default()?->id;
        $dismissed = DismissedExcludedSuggestion::pluck('name')->flip();

        // 共通の種別割当（name → 現在の共通種別ID。null は既定種別へ正規化）
        $common = ExcludedItem::get(['name', 'exclusion_type_id'])
            ->mapWithKeys(fn ($i) => [$i->name => $i->exclusion_type_id ?? $defaultId]);

        // DB保存ユーザーの個別割当を name×種別 で人数集計（unique(user_id,name) のため 1ユーザー1名1種別）。
        // ユーザー独自のカスタム種別への割当は共通種別の内訳として意味を持たないため除外する
        // （exclusion_type_id=null のカスタム割当を「その他」に誤計上しない）。
        $dbAgg = UserExcludedItem::query()
            ->whereNull('user_exclusion_type_id')
            ->selectRaw('name, exclusion_type_id, COUNT(DISTINCT user_id) as cnt')
            ->groupBy('name', 'exclusion_type_id')
            ->get()
            ->groupBy('name');

        // 端末（ローカル）保存ユーザーの匿名報告（名前のみ）
        $deviceNames = ReportedExcludedName::pluck('name')->flip();

        $names = collect($dbAgg->keys())->merge($deviceNames->keys())->unique();

        $rows = $names
            ->reject(fn ($name) => $dismissed->has($name))
            ->map(function ($name) use ($dbAgg, $deviceNames, $common, $defaultId) {
                $assigns = $dbAgg->get($name, collect());
                // 種別内訳（多い順）。type_id は raw（null=その他）。
                $breakdown = $assigns
                    ->map(fn ($r) => ['type_id' => $r->exclusion_type_id, 'count' => (int) $r->cnt])
                    ->sortByDesc('count')->values()->all();
                $current = $common->has($name) ? $common[$name] : null;

                if ($current === null) {
                    // 新規候補: DB割当か端末報告があれば候補
                    $userCount = (int) $assigns->sum('cnt');
                    if ($userCount === 0 && !$deviceNames->has($name)) {
                        return null;
                    }
                    $suggested = $assigns->whereNotNull('exclusion_type_id')
                        ->sortByDesc('cnt')->first()?->exclusion_type_id;
                    return [
                        'name'              => $name,
                        'user_count'        => $userCount,
                        'from_device'       => $deviceNames->has($name),
                        'current_type_id'   => null,
                        'suggested_type_id' => $suggested,
                        'type_assignments'  => $breakdown,
                    ];
                }

                // 上書き候補: 既に共通登録済み。現在の共通種別と異なる種別を設定したユーザーがいる場合のみ。
                $overriders = $assigns->filter(fn ($r) => ($r->exclusion_type_id ?? $defaultId) !== $current);
                if ($overriders->isEmpty()) {
                    return null;
                }
                // 最頻の上書き種別（null=その他は既定種別IDへ正規化して具体IDで返す）
                $top = $overriders->sortByDesc('cnt')->first();
                return [
                    'name'              => $name,
                    'user_count'        => (int) $overriders->sum('cnt'),
                    'from_device'       => false,
                    'current_type_id'   => $current,
                    'suggested_type_id' => $top->exclusion_type_id ?? $defaultId,
                    'type_assignments'  => $breakdown,
                ];
            })
            ->filter()
            // user_count 降順 → name 昇順
            ->sortBy([['user_count', 'desc'], ['name', 'asc']])
            ->values();

        return response()->json($rows);
    }

    /**
     * 端末（ローカルストレージ）保存ユーザーが除外したアイテム名を匿名で報告する（要ログイン）。
     *
     * ローカル保存の個別除外はサーバーに残らないため、共通除外への昇格を検討できるよう
     * 「名前」だけを匿名で集める（誰が・何人かは記録しない）。`names[]` でまとめて送れ、
     * 既存の名前は黙って無視する（firstOrCreate）。共通除外候補での扱いは userSuggestions 側で行う。
     */
    public function report(Request $request)
    {
        $data = $request->validate([
            'names'   => 'required|array|min:1',
            'names.*' => 'required|string|max:200',
        ]);

        $names = collect($data['names'])
            ->map(fn($n) => trim($n))
            ->filter(fn($n) => $n !== '')
            ->unique();

        foreach ($names as $name) {
            ReportedExcludedName::firstOrCreate(['name' => $name]);
        }

        return response()->json(null, 204);
    }

    /**
     * 管理: ユーザー個別除外の候補名を「共通にしない」と却下する（admin。`name`）。
     * 以後この名前は user-suggestions に表示されない。既に却下済みなら何もしない。
     */
    public function dismissSuggestion(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:200',
        ]);

        $name = trim($data['name']);
        if ($name === '') {
            return response()->json(['message' => 'name is required'], 422);
        }

        DismissedExcludedSuggestion::firstOrCreate(
            ['name' => $name],
            ['dismissed_by' => $request->user()->id],
        );

        return response()->json(null, 204);
    }

    /**
     * 管理: 共通の種別割当を追加／更新（admin）。
     * names[]（改行区切り由来）でまとめて登録でき、既定では既存と重複する名前は黙って無視する。
     * `update_existing=true` のときは、既存の名前の共通種別を指定種別へ**上書き更新**する
     * （ユーザー個別設定の共通化で、別種別への上書きを共通へ反映する用途）。
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'names'             => 'required|array|min:1',
            'names.*'           => 'required|string|max:200',
            'exclusion_type_id' => 'nullable|integer|exists:exclusion_types,id',
            'update_existing'   => 'sometimes|boolean',
        ]);

        $userId = $request->user()->id;
        // 種別未指定なら既定種別「その他」に入れる
        $typeId = $data['exclusion_type_id'] ?? ExclusionType::default()?->id;
        $updateExisting = $data['update_existing'] ?? false;
        // 入力内の重複・空白を整理
        $names = collect($data['names'])
            ->map(fn($n) => trim($n))
            ->filter(fn($n) => $n !== '')
            ->unique()
            ->values();

        $existing = ExcludedItem::whereIn('name', $names)->get()->keyBy('name');
        $created = [];
        $updatedCount = 0;
        $skippedCount = 0;
        foreach ($names as $name) {
            $row = $existing->get($name);
            if ($row !== null) {
                // 既存: update_existing 指定時かつ種別が変わるときだけ上書き更新する。
                if ($updateExisting && (int) $row->exclusion_type_id !== (int) $typeId) {
                    $row->update(['exclusion_type_id' => $typeId]);
                    $updatedCount++;
                } else {
                    $skippedCount++;
                }
                continue;
            }
            $created[] = ExcludedItem::create([
                'name'              => $name,
                'created_by'        => $userId,
                'exclusion_type_id' => $typeId,
            ]);
        }

        // 共通種別へ反映した名前は、ユーザー個別の種別割当から削除する（共通へ集約・重複排除）。
        // ユーザーのカスタム種別への割当は本人の明示的な分類なので残す（共通より優先のまま）。
        UserExcludedItem::whereIn('name', $names)->whereNull('user_exclusion_type_id')->delete();

        return response()->json([
            'created'       => $created,
            'created_count' => count($created),
            'updated_count' => $updatedCount,
            'skipped_count' => $skippedCount,
        ], 201);
    }

    public function update(Request $request, int $id)
    {
        $excluded = ExcludedItem::findOrFail($id);
        $data = $request->validate([
            'name'              => 'sometimes|required|string|max:200|unique:excluded_items,name,' . $excluded->id,
            'exclusion_type_id' => 'sometimes|nullable|integer|exists:exclusion_types,id',
        ]);
        $excluded->update($data);
        return response()->json($excluded->fresh());
    }

    public function destroy(int $id)
    {
        ExcludedItem::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    /** 管理: 選択した除外アイテムを一括削除（admin。`ids[]`）。 */
    public function destroyMany(Request $request)
    {
        $data = $request->validate([
            'ids'   => 'required|array|min:1',
            'ids.*' => 'integer',
        ]);

        $count = ExcludedItem::whereIn('id', $data['ids'])->delete();
        return response()->json(['deleted_count' => $count]);
    }
}
