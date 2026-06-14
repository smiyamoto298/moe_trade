<?php

namespace App\Http\Controllers;

use App\Models\BinderLabel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BinderLabelController extends Controller
{
    /** 公開: 候補文字列の配列（並び順）。レシピ登録のバインダー候補に使用。 */
    public function index()
    {
        $labels = BinderLabel::orderBy('sort_order')->orderBy('id')->pluck('label');
        return response()->json($labels);
    }

    /** 管理: 全件（id 付き）。管理画面用。 */
    public function adminIndex()
    {
        $items = BinderLabel::orderBy('sort_order')->orderBy('id')->get();
        return response()->json($items);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'label' => 'required|string|max:100|unique:binder_labels,label',
        ]);
        $data['sort_order'] = (int) (BinderLabel::max('sort_order') ?? -1) + 1;

        $label = BinderLabel::create($data);
        return response()->json($label, 201);
    }

    public function update(Request $request, int $id)
    {
        $label = BinderLabel::findOrFail($id);
        $data = $request->validate([
            'label' => 'required|string|max:100|unique:binder_labels,label,' . $label->id,
        ]);
        $label->update($data);
        return response()->json($label->fresh());
    }

    public function destroy(int $id)
    {
        BinderLabel::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    /** 受け取った id の順序で sort_order を 0,1,2... に振り直す。 */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids'   => 'required|array',
            'ids.*' => 'integer|exists:binder_labels,id',
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['ids'] as $order => $id) {
                BinderLabel::where('id', $id)->update(['sort_order' => $order]);
            }
        });

        return response()->json(null, 204);
    }
}
