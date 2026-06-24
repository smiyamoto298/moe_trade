<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ユーザー個別の除外アイテムに種別（exclusion_types）への参照を追加する。
 *
 * 「除外」から「表示種別（ジャンル）」へ概念転換したため、user_excluded_items は
 * 「ユーザーが分類したアイテム名→種別」の割当として使う。null は既定種別「その他」とみなす。
 * 既存行（旧・個別除外）は null のまま＝既定種別「その他」に集約される。
 * 種別削除時は nullOnDelete（既定種別「その他」扱いに戻る）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_excluded_items', function (Blueprint $table) {
            $table->foreignId('exclusion_type_id')->nullable()->after('name')
                ->constrained('exclusion_types')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('user_excluded_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('exclusion_type_id');
        });
    }
};
