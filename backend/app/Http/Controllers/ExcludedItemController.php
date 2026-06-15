<?php

namespace App\Http\Controllers;

use App\Models\DismissedExcludedSuggestion;
use App\Models\ExcludedItem;
use App\Models\ReportedExcludedName;
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
     * 管理: ユーザーが個別に登録した除外アイテムを名前で集計して、共通除外への昇格候補を返す。
     *
     * DB保存ユーザー分（user_excluded_items）は除外している人数を集計し、端末（ローカルストレージ）
     * 保存ユーザー分（reported_excluded_names・匿名報告）はその名前を `from_device` 付きで合流させる。
     * 端末分は誰が・何人除外したかを持たないため `user_count` には数えない（presence のみ）。
     * 共通除外（excluded_items）に既に登録済みの名前、および管理者が「共通にしない」と却下した
     * 名前（dismissed_excluded_suggestions）は両方から除く。
     *
     * 戻り値: [{ name, user_count, from_device }]（user_count 降順 → name 昇順）。
     */
    public function userSuggestions()
    {
        $excludeNames = ExcludedItem::pluck('name')
            ->merge(DismissedExcludedSuggestion::pluck('name'))
            ->unique()
            ->all();

        // DB保存ユーザーの個別除外を人数集計（name => user_count）
        $dbCounts = UserExcludedItem::query()
            ->selectRaw('name, COUNT(DISTINCT user_id) as user_count')
            ->when(!empty($excludeNames), fn($q) => $q->whereNotIn('name', $excludeNames))
            ->groupBy('name')
            ->pluck('user_count', 'name');

        // 端末保存ユーザーの匿名報告（名前のみ）
        $deviceNames = ReportedExcludedName::query()
            ->when(!empty($excludeNames), fn($q) => $q->whereNotIn('name', $excludeNames))
            ->pluck('name');

        $names = $dbCounts->keys()->merge($deviceNames)->unique();
        $deviceSet = $deviceNames->flip();

        $rows = $names
            ->map(fn($name) => [
                'name'        => $name,
                'user_count'  => (int) ($dbCounts[$name] ?? 0),
                'from_device' => $deviceSet->has($name),
            ])
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
