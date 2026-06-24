<?php

namespace App\Http\Controllers;

use App\Models\MoeAccount;
use App\Models\OwnedItem;
use App\Models\UserExcludedItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * 所持アイテム台帳（DB保存）のスナップショット入出力。
 *
 * 個人データかつ件数も数百規模のため、PUT ではユーザーの台帳全体を全置換する
 * シンプルな方式を採る（accounts / owned_items / user_excluded_items をまとめて入れ替え）。
 * クライアントはアカウントを文字列キー（key）で参照し、サーバーがキー→新IDへ対応づける。
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

            // 表示種別（ジャンル）の割当。後方互換のため文字列も許容する（NULL=既定種別「その他」）。
            // 各要素は文字列 "name" か、オブジェクト { name, exclusion_type_id } のいずれか。
            'exclusions'               => 'present|array',
        ]);

        $userId = $request->user()->id;
        // 有効な種別IDの集合（不正/存在しない type_id は null=既定種別に丸める）
        $validTypeIds = \App\Models\ExclusionType::pluck('id')->flip();

        DB::transaction(function () use ($userId, $data, $validTypeIds) {
            // 既存の台帳を全削除（owned_items を先に消してから accounts）
            OwnedItem::where('user_id', $userId)->delete();
            MoeAccount::where('user_id', $userId)->delete();
            UserExcludedItem::where('user_id', $userId)->delete();

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
                } else {
                    $name = trim((string) $entry);
                    $rawType = null;
                }
                if ($name === '' || isset($seen[$name])) {
                    continue;
                }
                $seen[$name] = true;
                $typeId = ($rawType !== null && $validTypeIds->has((int) $rawType)) ? (int) $rawType : null;
                UserExcludedItem::create([
                    'user_id'           => $userId,
                    'name'              => $name,
                    'exclusion_type_id' => $typeId,
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

        // ユーザーの種別割当（name→種別）。クライアントは effectiveTypeId で表示種別を決める。
        // 共通割当（excluded_items）が同名を持つ場合はそちらが優先されるため、ここでは
        // 共通に存在する name を除いて返す（共通へ昇格済みの個別割当は重複させない）。
        $commonNames = \App\Models\ExcludedItem::pluck('name')->flip();
        $exclusions = UserExcludedItem::where('user_id', $userId)
            ->orderBy('name')
            ->get(['name', 'exclusion_type_id'])
            ->filter(fn ($e) => !$commonNames->has($e->name))
            ->map(fn ($e) => [
                'name'              => $e->name,
                'exclusion_type_id' => $e->exclusion_type_id,
            ])
            ->values();

        // 保存先モード（local / db）。クライアントはこれを正としてどの保存先を読むか決める。
        $storageMode = \App\Models\User::whereKey($userId)->value('inventory_storage_mode') ?? 'local';

        return [
            'storage_mode' => $storageMode,
            'accounts'     => $accounts,
            'items'        => $items,
            'exclusions'   => $exclusions,
        ];
    }
}
