<?php

namespace App\Http\Controllers;

use App\Models\ServerExcludedItem;
use Illuminate\Http\Request;

/**
 * 「サーバ登録対象外」のシステム共通アイテム名（admin が管理）。
 *
 * ここに登録された名前のアイテムは、アイテムボックスの保存先がサーバー（DB）でもサーバーへ保存せず、
 * クライアントのローカルストレージにだけ保存する（運営に見られたくないアイテム向け）。
 * ユーザー個別指定分はクライアントのローカルストレージにのみ持つため、サーバーには来ない。
 */
class ServerExcludedItemController extends Controller
{
    /** 公開: システム共通の対象外アイテム名の一覧（文字列配列）。クライアントの分割保存判定に使う。 */
    public function index()
    {
        return response()->json(
            ServerExcludedItem::orderBy('name')->pluck('name')
        );
    }

    /** 管理: 全件（id 付き）。管理画面用。 */
    public function adminIndex()
    {
        return response()->json(ServerExcludedItem::orderBy('name')->get());
    }

    /**
     * 管理: 対象外アイテムを追加（admin）。
     * names[]（改行・カンマ区切り由来）でまとめて登録でき、既存と重複する名前は黙って無視する。
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'names'   => 'required|array|min:1',
            'names.*' => 'required|string|max:200',
        ]);

        $userId = $request->user()->id;
        $names = collect($data['names'])
            ->map(fn ($n) => trim($n))
            ->filter(fn ($n) => $n !== '')
            ->unique()
            ->values();

        $existing = ServerExcludedItem::whereIn('name', $names)->pluck('name')->all();
        $created = [];
        foreach ($names as $name) {
            if (in_array($name, $existing, true)) {
                continue;
            }
            $created[] = ServerExcludedItem::create([
                'name'       => $name,
                'created_by' => $userId,
            ]);
        }

        return response()->json([
            'created'       => $created,
            'created_count' => count($created),
            'skipped_count' => $names->count() - count($created),
        ], 201);
    }

    public function destroy(int $id)
    {
        ServerExcludedItem::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    /** 管理: 選択した対象外アイテムを一括削除（admin。`ids[]`）。 */
    public function destroyMany(Request $request)
    {
        $data = $request->validate([
            'ids'   => 'required|array|min:1',
            'ids.*' => 'integer',
        ]);

        $count = ServerExcludedItem::whereIn('id', $data['ids'])->delete();
        return response()->json(['deleted_count' => $count]);
    }
}
