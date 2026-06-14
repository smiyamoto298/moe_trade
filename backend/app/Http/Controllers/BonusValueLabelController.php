<?php

namespace App\Http\Controllers;

use App\Models\BonusValueLabel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BonusValueLabelController extends Controller
{
    /**
     * 公開: 候補文字列の配列。アイテム登録・絞り込みの候補に使用。
     * 整理済み（並び順）→ 未整理（文字順）の順で返す。
     */
    public function index()
    {
        $labels = BonusValueLabel::query()
            ->orderByDesc('is_organized')
            ->orderBy('sort_order')
            ->orderBy('label')
            ->orderBy('id')
            ->pluck('label');
        return response()->json($labels);
    }

    /** 管理: 全件（id・整理済みフラグ付き）。管理画面の2ペイン表示用。 */
    public function adminIndex()
    {
        $items = BonusValueLabel::query()
            ->orderByDesc('is_organized')
            ->orderBy('sort_order')
            ->orderBy('label')
            ->orderBy('id')
            ->get();
        return response()->json($items);
    }

    /** 手動追加した項目名は「未整理」として登録する（管理画面で整理する）。 */
    public function store(Request $request)
    {
        $data = $request->validate([
            'label' => 'required|string|max:100|unique:bonus_value_labels,label',
        ]);
        $data['is_organized'] = false;
        $data['sort_order']   = 0;

        $label = BonusValueLabel::create($data);
        return response()->json($label, 201);
    }

    public function update(Request $request, int $id)
    {
        $label = BonusValueLabel::findOrFail($id);
        $data = $request->validate([
            'label' => 'required|string|max:100|unique:bonus_value_labels,label,' . $label->id,
        ]);
        $label->update($data);
        return response()->json($label->fresh());
    }

    public function destroy(int $id)
    {
        BonusValueLabel::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    /**
     * 整理済み（左ペイン）の項目を確定する。
     * 受け取った id 列がそのまま整理済みの並び（sort_order=0,1,2...）になり、
     * それ以外はすべて未整理（is_organized=false・sort_order=0）に戻す。
     * これ1本で「未整理→整理済みへ移動」「整理済み内の並べ替え」「整理済み→未整理へ戻す」を扱う。
     */
    public function organize(Request $request)
    {
        $data = $request->validate([
            'ids'   => 'present|array',
            'ids.*' => 'integer|distinct|exists:bonus_value_labels,id',
        ]);

        DB::transaction(function () use ($data) {
            // いったん全件を未整理に戻してから、受け取った並びだけ整理済みにする。
            BonusValueLabel::query()->update(['is_organized' => false, 'sort_order' => 0]);
            foreach ($data['ids'] as $order => $id) {
                BonusValueLabel::where('id', $id)->update(['is_organized' => true, 'sort_order' => $order]);
            }
        });

        return response()->json(null, 204);
    }
}
