<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // レシピ: {レシピ名, 必要スキル値} の組を複数保持する JSON 配列。
            // 単一の recipe_name / skill_requirements は第1エントリからの派生互換値として残す
            // （recipe_binder はレシピでは未使用・常に null だが列は残置）。
            $table->json('recipe_entries')->nullable()->after('recipe_binder');
        });

        // 既存レシピ行を単一エントリへバックフィル（recipe_name / recipe_binder / skill_requirements のいずれかを持つ行）
        DB::table('items')
            ->where(function ($q) {
                $q->whereNotNull('recipe_name')
                    ->orWhereNotNull('recipe_binder')
                    ->orWhereNotNull('skill_requirements');
            })
            ->whereNull('recipe_entries')
            ->orderBy('id')
            ->each(function ($row) {
                // レシピ以外（スキル種別など skill_requirements を持つアイテム）を巻き込まないよう、
                // レシピ情報（名前 or バインダー）が無い行はスキップする。
                if ($row->recipe_name === null && $row->recipe_binder === null) {
                    return;
                }
                $skills = $row->skill_requirements
                    ? json_decode($row->skill_requirements, true)
                    : null;
                // レシピはバインダーを持たないため、エントリはレシピ名＋必要スキル値のみ。
                // レシピ名も必要スキルも無い行（旧バインダーのみ）はエントリ化しない。
                if ($row->recipe_name === null && !is_array($skills)) {
                    return;
                }
                $entry = [
                    'name'   => $row->recipe_name,
                    'skill_requirements' => is_array($skills) ? $skills : (object) [],
                ];
                DB::table('items')->where('id', $row->id)->update([
                    'recipe_entries' => json_encode([$entry], JSON_UNESCAPED_UNICODE),
                ]);
            });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('recipe_entries');
        });
    }
};
