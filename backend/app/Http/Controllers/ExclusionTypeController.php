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

    /** 管理: 種別を追加（admin。`name`）。 */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100|unique:exclusion_types,name',
        ]);

        $type = ExclusionType::create([
            'name'       => trim($data['name']),
            'is_default' => false,
            'sort_order' => (int) (ExclusionType::max('sort_order') ?? 0) + 1,
        ]);

        return response()->json($type, 201);
    }

    /** 管理: 種別の改名（admin）。既定種別も改名は可。is_default は変更しない。 */
    public function update(Request $request, int $id)
    {
        $type = ExclusionType::findOrFail($id);
        $data = $request->validate([
            'name' => 'required|string|max:100|unique:exclusion_types,name,' . $type->id,
        ]);
        $type->update(['name' => trim($data['name'])]);
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
