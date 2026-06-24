<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * システム共通のサーバ登録対象外アイテムの初期データ。
 * 「エンシェント コイン」は保存先がサーバーでも端末ローカルにのみ保存する（既定で対象外）。
 * 重複投入を避けるため insertOrIgnore（name は unique）。
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('server_excluded_items')->insertOrIgnore([
            'name'       => 'エンシェント コイン',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('server_excluded_items')->where('name', 'エンシェント コイン')->delete();
    }
};
