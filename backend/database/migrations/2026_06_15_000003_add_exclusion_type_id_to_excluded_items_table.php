<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 共通除外アイテムに種別（exclusion_types）への参照を追加する。
 * 既存行は既定種別「その他」へバックフィルする。種別削除時は nullOnDelete が安全網
 * （通常はコントローラ側で既定種別へ付け替えてから削除する）。null は既定種別とみなす。
 */
return new class extends Migration
{
    public function up(): void
    {
        $defaultId = DB::table('exclusion_types')->where('is_default', true)->value('id');

        Schema::table('excluded_items', function (Blueprint $table) {
            $table->foreignId('exclusion_type_id')->nullable()->after('name')
                ->constrained('exclusion_types')->nullOnDelete();
        });

        // 既存の除外アイテムを既定種別「その他」へ付け替える。
        if ($defaultId !== null) {
            DB::table('excluded_items')->whereNull('exclusion_type_id')->update(['exclusion_type_id' => $defaultId]);
        }
    }

    public function down(): void
    {
        Schema::table('excluded_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('exclusion_type_id');
        });
    }
};
