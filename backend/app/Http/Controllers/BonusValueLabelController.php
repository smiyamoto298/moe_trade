<?php

namespace App\Http\Controllers;

use App\Models\BonusValueLabel;
use App\Models\Item;
use App\Models\ItemBonusEffect;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BonusValueLabelController extends Controller
{
    /**
     * リクエストの種別（kind）。bonus=付加効果の項目名 / stat=追加効果「その他」の項目名。
     * 未指定は従来どおり bonus（後方互換）。
     */
    private function kind(Request $request): string
    {
        $data = $request->validate([
            'kind' => ['nullable', Rule::in(BonusValueLabel::KINDS)],
        ]);
        return $data['kind'] ?? BonusValueLabel::KIND_BONUS;
    }

    /**
     * 公開: 候補文字列の配列。アイテム登録・絞り込みの候補に使用。
     * 整理済み（並び順）→ 未整理（文字順）の順で返す。
     */
    public function index(Request $request)
    {
        $labels = BonusValueLabel::query()
            ->where('kind', $this->kind($request))
            ->orderByDesc('is_organized')
            ->orderBy('sort_order')
            ->orderBy('label')
            ->orderBy('id')
            ->pluck('label');
        return response()->json($labels);
    }

    /** 管理: 全件（id・整理済みフラグ付き）。管理画面の2ペイン表示用。 */
    public function adminIndex(Request $request)
    {
        $items = BonusValueLabel::query()
            ->where('kind', $this->kind($request))
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
        $kind = $this->kind($request);
        $data = $request->validate([
            'label' => [
                'required', 'string', 'max:100',
                Rule::unique('bonus_value_labels', 'label')->where('kind', $kind),
            ],
        ]);
        $data['kind']         = $kind;
        $data['is_organized'] = false;
        $data['sort_order']   = 0;

        $label = BonusValueLabel::create($data);
        return response()->json($label, 201);
    }

    public function update(Request $request, int $id)
    {
        $label = BonusValueLabel::findOrFail($id);
        $data = $request->validate([
            'label' => [
                'required', 'string', 'max:100',
                Rule::unique('bonus_value_labels', 'label')->where('kind', $label->kind)->ignore($label->id),
            ],
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
     * 未整理の項目名($id)を整理済みの項目名($target_id)へ統合する。
     * 表記ゆれ（誤字・別表記）で自動追加された未整理項目を、正とする整理済み項目へ寄せるための操作。
     *
     * 統合元の項目名を使用しているアイテム側のデータを統合先の項目名へ一括更新し、統合元を削除する:
     *   kind='stat'  … items.base_stats の自由入力キー（追加効果「その他」）を付け替える。
     *                  アイテムが統合先のキーを既に持つ場合は既存値を優先し、統合元のキーだけ取り除く。
     *   kind='bonus' … item_bonus_effects.values[*].label（付加効果の項目名）を付け替える。
     *
     * 統合元は未整理・統合先は同一種別の整理済みであること（それ以外は 422）。
     */
    public function merge(Request $request, int $id)
    {
        $source = BonusValueLabel::findOrFail($id);
        $data = $request->validate([
            'target_id' => 'required|integer|exists:bonus_value_labels,id',
        ]);
        $target = BonusValueLabel::findOrFail($data['target_id']);

        if ($target->id === $source->id) {
            return response()->json(['message' => '同じ項目名には統合できません。'], 422);
        }
        if ($target->kind !== $source->kind) {
            return response()->json(['message' => '種別（付加効果/追加効果）が異なる項目名には統合できません。'], 422);
        }
        if ($source->is_organized) {
            return response()->json(['message' => '統合できるのは未整理の項目名のみです。'], 422);
        }
        if (!$target->is_organized) {
            return response()->json(['message' => '統合先には整理済みの項目名を指定してください。'], 422);
        }

        $updated = 0;
        DB::transaction(function () use ($source, $target, &$updated) {
            if ($source->kind === BonusValueLabel::KIND_STAT) {
                // 追加効果「その他」: base_stats の統合元キーを統合先キーへ付け替える。
                // 任意の項目名を SQL の JSON パスへ補間できないため、PHP 側でキーを判定して更新する。
                Item::query()->chunkById(200, function ($items) use ($source, $target, &$updated) {
                    foreach ($items as $item) {
                        $stats = $item->base_stats ?? [];
                        if (!is_array($stats) || !array_key_exists($source->label, $stats)) {
                            continue;
                        }
                        // 統合先のキーを既に持つ場合は既存値を優先する（上書きしない）
                        if (!array_key_exists($target->label, $stats)) {
                            $stats[$target->label] = $stats[$source->label];
                        }
                        unset($stats[$source->label]);
                        $item->update(['base_stats' => $stats]);
                        $updated++;
                    }
                });
            } else {
                // 付加効果: values[*].label の統合元項目名を統合先へ付け替える
                ItemBonusEffect::query()->chunkById(200, function ($effects) use ($source, $target, &$updated) {
                    foreach ($effects as $effect) {
                        $values  = $effect->values ?? [];
                        $changed = false;
                        foreach ($values as $i => $value) {
                            if (($value['label'] ?? null) === $source->label) {
                                $values[$i]['label'] = $target->label;
                                $changed = true;
                            }
                        }
                        if ($changed) {
                            $effect->update(['values' => $values]);
                            $updated++;
                        }
                    }
                });
            }

            $source->delete();
        });

        return response()->json([
            'merged_into'   => $target->only(['id', 'label']),
            'updated_count' => $updated,
        ]);
    }

    /**
     * 整理済み（左ペイン）の項目を種別（kind）内で確定する。
     * 受け取った id 列がそのまま整理済みの並び（sort_order=0,1,2...）になり、
     * 同一種別のそれ以外はすべて未整理（is_organized=false・sort_order=0）に戻す。
     * 他の種別の整理状態には影響しない。
     * これ1本で「未整理→整理済みへ移動」「整理済み内の並べ替え」「整理済み→未整理へ戻す」を扱う。
     */
    public function organize(Request $request)
    {
        $kind = $this->kind($request);
        $data = $request->validate([
            'ids'   => 'present|array',
            'ids.*' => [
                'integer', 'distinct',
                Rule::exists('bonus_value_labels', 'id')->where('kind', $kind),
            ],
        ]);

        DB::transaction(function () use ($data, $kind) {
            // いったん同一種別の全件を未整理に戻してから、受け取った並びだけ整理済みにする。
            BonusValueLabel::where('kind', $kind)->update(['is_organized' => false, 'sort_order' => 0]);
            foreach ($data['ids'] as $order => $id) {
                BonusValueLabel::where('id', $id)->update(['is_organized' => true, 'sort_order' => $order]);
            }
        });

        return response()->json(null, 204);
    }
}
