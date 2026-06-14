<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 付加効果の項目名を「整理済み（管理者が並びを確定した候補）」と
        // 「未整理（アイテム登録時に自動追加された未レビュー候補）」に分ける。
        // 整理済みのみ並び順を持ち、公開候補では整理済み→未整理の順で表示する。
        Schema::table('bonus_value_labels', function (Blueprint $table) {
            $table->boolean('is_organized')->default(false)->after('label');
        });

        // 既存の候補は管理者が積み上げてきた並びなので、すべて整理済みとして扱う。
        DB::table('bonus_value_labels')->update(['is_organized' => true]);
    }

    public function down(): void
    {
        Schema::table('bonus_value_labels', function (Blueprint $table) {
            $table->dropColumn('is_organized');
        });
    }
};
