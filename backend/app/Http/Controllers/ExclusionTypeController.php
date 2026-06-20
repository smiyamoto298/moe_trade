<?php

namespace App\Http\Controllers;

use App\Models\ExcludedItem;
use App\Models\ExclusionType;
use Illuminate\Http\Request;

/**
 * 共通除外アイテムの種別（カテゴリ）管理（admin）。
 * 既定種別「その他」は削除できない（改名は可）。種別を削除すると、その種別に属する
 * 除外アイテムは既定種別へ付け替えてから削除する。
 */
class ExclusionTypeController extends Controller
{
    /** 管理: 全種別（sort_order → name 順）。 */
    public function index()
    {
        return response()->json(
            ExclusionType::orderBy('sort_order')->orderBy('name')->get()
        );
    }

    /** 管理: 種別を追加（admin。`name`、任意で `default_enabled`）。default_enabled 省略時は既定ON。 */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'            => 'required|string|max:100|unique:exclusion_types,name',
            'default_enabled' => 'sometimes|boolean',
        ]);

        $type = ExclusionType::create([
            'name'            => trim($data['name']),
            'is_default'      => false,
            'default_enabled' => $data['default_enabled'] ?? true,
            'sort_order'      => (int) (ExclusionType::max('sort_order') ?? 0) + 1,
        ]);

        return response()->json($type, 201);
    }

    /**
     * 管理: 種別の更新（admin）。改名（`name`）と既定ON/OFF（`default_enabled`）を部分更新できる。
     * 既定種別も改名・default_enabled 変更は可。is_default は変更しない。
     */
    public function update(Request $request, int $id)
    {
        $type = ExclusionType::findOrFail($id);
        $data = $request->validate([
            'name'            => 'sometimes|required|string|max:100|unique:exclusion_types,name,' . $type->id,
            'default_enabled' => 'sometimes|boolean',
        ]);
        if (array_key_exists('name', $data)) {
            $data['name'] = trim($data['name']);
        }
        $type->update($data);
        return response()->json($type->fresh());
    }

    /**
     * 管理: 種別を削除（admin）。
     * 既定種別は削除不可（422）。非既定なら属する除外アイテムを既定種別へ付け替えてから削除する。
     */
    public function destroy(int $id)
    {
        $type = ExclusionType::findOrFail($id);
        if ($type->is_default) {
            return response()->json(['message' => '既定の種別は削除できません。'], 422);
        }

        $default = ExclusionType::default();
        if ($default !== null) {
            ExcludedItem::where('exclusion_type_id', $type->id)
                ->update(['exclusion_type_id' => $default->id]);
        }

        $type->delete();
        return response()->json(null, 204);
    }
}
