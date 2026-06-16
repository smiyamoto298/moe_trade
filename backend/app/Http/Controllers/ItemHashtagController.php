<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\ItemHashtag;
use Illuminate\Http\Request;

/**
 * アイテムのユーザー追加ハッシュタグ（wiki型）。
 * ログイン中の任意のユーザーが追加・削除できる。固定タグ（is_fixed）は対象外。
 * 固定タグの設定はアイテム編集（ItemController::update）で admin/editor のみ行う。
 */
class ItemHashtagController extends Controller
{
    public function store(Request $request, int $itemId)
    {
        $item = Item::findOrFail($itemId);

        $data = $request->validate([
            'tag' => 'required|string|max:50',
        ]);

        $tag = ItemHashtag::normalize($data['tag']);
        if ($tag === '') {
            return response()->json(['message' => 'タグを入力してください。'], 422);
        }
        if (mb_strlen($tag) > 50) {
            return response()->json(['message' => 'タグは50文字以内で入力してください。'], 422);
        }

        // 既に同じタグ（固定・ユーザー問わず）があれば追加しない（重複防止）。
        $exists = $item->hashtags()
            ->whereRaw('LOWER(tag) = ?', [mb_strtolower($tag)])
            ->first();
        if ($exists) {
            return response()->json($exists, 200);
        }

        $hashtag = $item->hashtags()->create([
            'tag'        => $tag,
            'is_fixed'   => false,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($hashtag, 201);
    }

    /**
     * ユーザー追加タグ（is_fixed=false）をテキストボックス入力で総入れ替えする（wiki型・ログイン必須）。
     * 固定タグには触れない。本文 `tags` は配列、または空白区切りの文字列を受け付ける。
     */
    public function replace(Request $request, int $itemId)
    {
        $item = Item::findOrFail($itemId);

        $data = $request->validate([
            'tags'   => 'present|array',
            'tags.*' => 'string|max:50',
        ]);

        ItemHashtag::replaceForItem($item, $data['tags'], false, $request->user()->id);

        return response()->json($item->load('hashtags')->hashtags);
    }

    public function destroy(Request $request, int $itemId, int $hashtagId)
    {
        $item    = Item::findOrFail($itemId);
        $hashtag = $item->hashtags()->findOrFail($hashtagId);

        // 固定タグは admin/editor のみ削除できる（一般ユーザーは不可）。
        // 通常（ユーザー追加）タグはログイン中の任意ユーザーが削除できる（wiki型）。
        if ($hashtag->is_fixed && !$request->user()->isEditor()) {
            abort(403, '固定ハッシュタグはユーザーが削除できません。');
        }

        $hashtag->delete();

        return response()->json(null, 204);
    }
}
