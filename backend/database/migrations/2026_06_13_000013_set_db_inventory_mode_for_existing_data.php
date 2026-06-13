<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * 既にサーバー（DB）へ所持アイテム台帳を保存済みの既存ユーザーを `db` モードへ初期化する。
 *
 * 保存先モードのサーバー保持（inventory_storage_mode）を導入する前は、モードは端末の
 * localStorage にしか無かった。列追加時の既定は `local` のため、そのままだと「以前サーバー
 * 保存を選んでいたユーザー」も local 表示に戻ってしまう。台帳データ（owned_items /
 * moe_accounts / user_excluded_items のいずれか）を持つユーザーは DB 保存を選んでいたと
 * みなし、`db` に初期化する。これらのテーブルは DB 保存（InventoryController::replace）経由で
 * のみ書き込まれるため、データの有無が保存先選択の signal になる。
 */
return new class extends Migration
{
    public function up(): void
    {
        $userIds = collect()
            ->merge(DB::table('owned_items')->distinct()->pluck('user_id'))
            ->merge(DB::table('moe_accounts')->distinct()->pluck('user_id'))
            ->merge(DB::table('user_excluded_items')->distinct()->pluck('user_id'))
            ->filter()
            ->unique()
            ->values();

        if ($userIds->isNotEmpty()) {
            DB::table('users')->whereIn('id', $userIds)->update(['inventory_storage_mode' => 'db']);
        }
    }

    public function down(): void
    {
        // どのユーザーが移行対象だったかは復元できないため何もしない。
    }
};
