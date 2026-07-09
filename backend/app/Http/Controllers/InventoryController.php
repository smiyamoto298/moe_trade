<?php

namespace App\Http\Controllers;

use App\Models\MoeAccount;
use App\Models\OwnedItem;
use App\Models\UserExcludedItem;
use App\Models\UserExclusionType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * 所持アイテム台帳（DB保存）のスナップショット入出力。
 *
 * 個人データかつ件数も数百規模のため、PUT ではユーザーの台帳全体を全置換する
 * シンプルな方式を採る（accounts / owned_items / user_excluded_items / user_exclusion_types をまとめて入れ替え）。
 * クライアントはアカウントとカスタム種別を文字列キー（key）で参照し、サーバーがキー→新IDへ対応づける
 * （カスタム種別は name 単位で upsert し id を安定させる）。
 */
class InventoryController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->user();
        return response()->json($this->snapshot($user->id));
    }

    /**
     * 保存先モード（local / db）をユーザー単位で記憶する。
     *
     * 端末ごとの localStorage ではなくサーバーに持たせることで、どの端末でログインしても
     * 同じ保存先が適用される（「サーバー」を選んだ事実が他端末にも反映される）。
     */
    public function setStorageMode(Request $request)
    {
        $data = $request->validate([
            'mode' => 'required|in:local,db',
        ]);

        $user = $request->user();
        $user->inventory_storage_mode = $data['mode'];
        $user->save();

        return response()->json(['storage_mode' => $user->inventory_storage_mode]);
    }

    public function replace(Request $request)
    {
        $data = $request->validate([
            'accounts'                 => 'present|array',
            'accounts.*.key'           => 'required|string|max:100',
            'accounts.*.name'          => 'required|string|max:100',
            'accounts.*.sort_order'    => 'nullable|integer',

            'items'                    => 'present|array',
            'items.*.account_key'      => 'nullable|string|max:100',
            'items.*.item_id'          => 'nullable|integer|exists:items,id',
            'items.*.no'               => 'nullable|string|max:50',
            'items.*.name'             => 'required|string|max:200',
            'items.*.category'         => 'nullable|string|max:100',
            'items.*.count'            => 'nullable|integer|min:0',
            'items.*.price'            => 'nullable|integer|min:0',
            'items.*.note'             => 'nullable|string|max:500',
            'items.*.is_worn'          => 'nullable|boolean',
            'items.*.is_dyed'          => 'nullable|boolean',
            'items.*.is_marked'        => 'nullable|boolean',
            'items.*.sort_order'       => 'nullable|integer',

            // ユーザーごとのカスタム種別。クライアントキー（key）で exclusions から参照される。
            // 後方互換のため省略可（旧クライアントは送らない＝カスタム種別なしとして全削除）。
            'custom_types'              => 'sometimes|array',
            'custom_types.*.key'        => 'required|string|max:100',
            'custom_types.*.name'       => 'required|string|max:100',
            'custom_types.*.sort_order' => 'nullable|integer',

            // 表示種別（ジャンル）の割当。後方互換のため文字列も許容する（NULL=既定種別「その他」）。
            // 各要素は文字列 "name" か、オブジェクト { name, exclusion_type_id, custom_type_key } のいずれか。
            'exclusions'               => 'present|array',
        ]);

        $userId = $request->user()->id;
        // 有効な種別IDの集合（不正/存在しない type_id は null=既定種別に丸める）
        $validTypeIds = \App\Models\ExclusionType::pluck('id')->flip();
        $defaultId = \App\Models\ExclusionType::default()?->id;
        // 共通の種別割当（name → 現在の共通種別ID。null は既定種別へ正規化）。
        // ユーザーの個別設定が共通と同じ種別なら冗長なので保存しない（共通に従う）。
        $commonTypes = \App\Models\ExcludedItem::get(['name', 'exclusion_type_id'])
            ->mapWithKeys(fn ($i) => [$i->name => $i->exclusion_type_id ?? $defaultId]);

        DB::transaction(function () use ($userId, $data, $validTypeIds, $defaultId, $commonTypes) {
            // 既存の台帳を全削除（owned_items を先に消してから accounts）
            OwnedItem::where('user_id', $userId)->delete();
            MoeAccount::where('user_id', $userId)->delete();
            UserExcludedItem::where('user_id', $userId)->delete();

            // カスタム種別を name 単位で同期する（delete-recreate ではなく upsert）。
            // id を保つことで、端末に保存された種別タブ選択などの参照が保存のたびに壊れない。
            $existingCustom = UserExclusionType::where('user_id', $userId)->get()->keyBy('name');
            $keyToCustomId = [];   // クライアントキー → id
            $customIdByName = [];  // 同名重複の payload は最初の1件に集約
            foreach ($data['custom_types'] ?? [] as $i => $ct) {
                $name = trim((string) $ct['name']);
                if ($name === '') {
                    continue;
                }
                if (isset($customIdByName[$name])) {
                    $keyToCustomId[$ct['key']] = $customIdByName[$name];
                    continue;
                }
                $row = $existingCustom->get($name);
                if ($row) {
                    $row->update(['sort_order' => $ct['sort_order'] ?? $i]);
                } else {
                    $row = UserExclusionType::create([
                        'user_id'    => $userId,
                        'name'       => $name,
                        'sort_order' => $ct['sort_order'] ?? $i,
                    ]);
                }
                $keyToCustomId[$ct['key']] = $row->id;
                $customIdByName[$name] = $row->id;
            }
            // payload に無くなったカスタム種別は削除（全置換の一部。割当側は上で全削除済み）
            UserExclusionType::where('user_id', $userId)
                ->whereNotIn('id', array_values($customIdByName))
                ->delete();

            // アカウントを作成し、クライアントキー → 新ID の対応表を作る
            $keyToId = [];
            foreach ($data['accounts'] as $i => $acc) {
                $created = MoeAccount::create([
                    'user_id'    => $userId,
                    'name'       => $acc['name'],
                    'sort_order' => $acc['sort_order'] ?? $i,
                ]);
                $keyToId[$acc['key']] = $created->id;
            }

            foreach ($data['items'] as $i => $row) {
                OwnedItem::create([
                    'user_id'        => $userId,
                    'moe_account_id' => isset($row['account_key']) ? ($keyToId[$row['account_key']] ?? null) : null,
                    'item_id'        => $row['item_id'] ?? null,
                    'no'             => $row['no'] ?? null,
                    'name'           => $row['name'],
                    'category'       => $row['category'] ?? null,
                    'count'          => $row['count'] ?? 0,
                    'price'          => $row['price'] ?? null,
                    'note'           => $row['note'] ?? null,
                    'is_worn'        => $row['is_worn'] ?? false,
                    'is_dyed'        => $row['is_dyed'] ?? false,
                    'is_marked'      => $row['is_marked'] ?? false,
                    'sort_order'     => $row['sort_order'] ?? $i,
                ]);
            }

            // ユーザーの種別割当（name→種別）。文字列／オブジェクト両対応。name 単位で重複は無視。
            $seen = [];
            foreach ($data['exclusions'] as $entry) {
                if (is_array($entry)) {
                    $name = trim((string) ($entry['name'] ?? ''));
                    $rawType = $entry['exclusion_type_id'] ?? null;
                    $customKey = $entry['custom_type_key'] ?? null;
                } else {
                    $name = trim((string) $entry);
                    $rawType = null;
                    $customKey = null;
                }
                if ($name === '' || isset($seen[$name])) {
                    continue;
                }
                $seen[$name] = true;
                // カスタム種別への割当（キーが有効なもののみ。無効キーは共通種別の割当として扱う）
                $customId = ($customKey !== null && isset($keyToCustomId[$customKey])) ? $keyToCustomId[$customKey] : null;
                $typeId = ($rawType !== null && $validTypeIds->has((int) $rawType)) ? (int) $rawType : null;
                // 共通登録済みと同じ種別の個別設定は冗長なので保存しない（共通に従う＝該当設定は削除）。
                // 種別が異なる場合は上書きとして保存する。カスタム種別への割当は常にユーザー固有なので対象外。
                if ($customId === null && $commonTypes->has($name) && ($typeId ?? $defaultId) === $commonTypes[$name]) {
                    continue;
                }
                UserExcludedItem::create([
                    'user_id'                => $userId,
                    'name'                   => $name,
                    'exclusion_type_id'      => $customId !== null ? null : $typeId,
                    'user_exclusion_type_id' => $customId,
                ]);
            }
        });

        return response()->json($this->snapshot($userId));
    }

    /**
     * ユーザーの台帳スナップショットを組み立てる。
     * item_id がある行には登録アイテム（出品一覧と同じ整形）を同梱する。
     */
    private function snapshot(int $userId): array
    {
        $accounts = MoeAccount::where('user_id', $userId)
            ->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'name', 'sort_order']);

        $items = OwnedItem::with([
            'item.category', 'item.bonusEffects',
            'item.setMembers.category', 'item.setMembers.bonusEffects',
        ])
            ->where('user_id', $userId)
            ->orderBy('sort_order')->orderBy('id')
            ->get();

        // ユーザーごとのカスタム種別（クライアントはタブ・種別選択ダイアログに表示する）
        $customTypes = UserExclusionType::where('user_id', $userId)
            ->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'name', 'sort_order']);

        // ユーザーの種別割当（name→種別）。クライアントは effectiveTypeId で表示種別を決める。
        // ユーザー割当は共通割当（excluded_items）より優先される（ユーザーが共通種別を上書きできる）ため、
        // 共通と種別が異なる割当（＝上書き）はそのまま返す。一方、共通と同じ種別の割当は冗長なので
        // 取り除く（共通に従う＝該当設定は削除）。null は既定種別へ正規化して比較する。
        // カスタム種別への割当（custom_type_id 付き）は常にユーザー固有なので冗長判定の対象外。
        $defaultId = \App\Models\ExclusionType::default()?->id;
        $commonTypes = \App\Models\ExcludedItem::get(['name', 'exclusion_type_id'])
            ->mapWithKeys(fn ($i) => [$i->name => $i->exclusion_type_id ?? $defaultId]);
        $exclusions = UserExcludedItem::where('user_id', $userId)
            ->orderBy('name')
            ->get(['name', 'exclusion_type_id', 'user_exclusion_type_id'])
            ->filter(fn ($e) => $e->user_exclusion_type_id !== null
                || !$commonTypes->has($e->name)
                || ($e->exclusion_type_id ?? $defaultId) !== $commonTypes[$e->name])
            ->map(fn ($e) => [
                'name'              => $e->name,
                'exclusion_type_id' => $e->exclusion_type_id,
                'custom_type_id'    => $e->user_exclusion_type_id,
            ])
            ->values();

        // 保存先モード（local / db）。クライアントはこれを正としてどの保存先を読むか決める。
        $storageMode = \App\Models\User::whereKey($userId)->value('inventory_storage_mode') ?? 'local';

        return [
            'storage_mode' => $storageMode,
            'accounts'     => $accounts,
            'items'        => $items,
            'exclusions'   => $exclusions,
            'custom_types' => $customTypes,
        ];
    }
}
