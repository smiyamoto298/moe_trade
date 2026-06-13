<?php

namespace App\Http\Controllers;

use App\Models\DismissedExcludedSuggestion;
use App\Models\ExcludedItem;
use App\Models\UserExcludedItem;
use Illuminate\Http\Request;

/**
 * 管理者が登録する共通の除外アイテム（アイテム名・文字列単位）。
 * 所持品管理・一括出品の貼り付けで、ここに登録された名前を除外する。
 */
class ExcludedItemController extends Controller
{
    /** 公開: 除外アイテム名の配列。貼り付け除外に使用（ローカル保存ユーザーも取得する）。 */
    public function index()
    {
        return response()->json(ExcludedItem::orderBy('name')->pluck('name'));
    }

    /** 管理: 全件（id 付き）。管理画面用。 */
    public function adminIndex()
    {
        return response()->json(ExcludedItem::orderBy('name')->get());
    }

    /**
     * 管理: ユーザーが個別に登録した除外アイテム（DB保存分）を名前で集計して返す。
     * 共通除外（excluded_items）に既に登録済みの名前、および管理者が「共通にしない」と
     * 却下した名前（dismissed_excluded_suggestions）は除く。多くのユーザーが除外している
     * アイテムを共通除外へ昇格させる候補として使う。
     * 戻り値: [{ name, user_count }]（user_count 降順 → name 昇順）
     * ※ ローカルストレージ保存のユーザー分は DB に無いため集計対象外。
     */
    public function userSuggestions()
    {
        $excludeNames = ExcludedItem::pluck('name')
            ->merge(DismissedExcludedSuggestion::pluck('name'))
            ->unique()
            ->all();

        $rows = UserExcludedItem::query()
            ->selectRaw('name, COUNT(DISTINCT user_id) as user_count')
            ->when(!empty($excludeNames), fn($q) => $q->whereNotIn('name', $excludeNames))
            ->groupBy('name')
            ->orderByDesc('user_count')
            ->orderBy('name')
            ->get();

        return response()->json($rows);
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
     * 管理: 除外アイテムを追加（admin）。
     * names[]（改行区切り由来）でまとめて登録でき、既存と重複する名前は黙って無視する。
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'names'   => 'required|array|min:1',
            'names.*' => 'required|string|max:200',
        ]);

        $userId = $request->user()->id;
        // 入力内の重複・空白を整理
        $names = collect($data['names'])
            ->map(fn($n) => trim($n))
            ->filter(fn($n) => $n !== '')
            ->unique()
            ->values();

        $existing = ExcludedItem::whereIn('name', $names)->pluck('name')->all();
        $created = [];
        foreach ($names as $name) {
            if (in_array($name, $existing, true)) {
                continue;
            }
            $created[] = ExcludedItem::create(['name' => $name, 'created_by' => $userId]);
        }

        return response()->json([
            'created'      => $created,
            'created_count' => count($created),
            'skipped_count' => $names->count() - count($created),
        ], 201);
    }

    public function update(Request $request, int $id)
    {
        $excluded = ExcludedItem::findOrFail($id);
        $data = $request->validate([
            'name' => 'required|string|max:200|unique:excluded_items,name,' . $excluded->id,
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
