<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// アクセス記録を「日単位」から「日＋時間帯単位」へ拡張する。利用状況解析の時間帯分布に
// アクセスを出せるようにするため、(user_id, date) ユニークを (user_id, date, hour) ユニークに置き換える。
// 既存行は時刻が分からないため hour は null のまま残す（時間帯分布からは除外される）。
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_daily_accesses', function (Blueprint $table) {
            // JST（Asia/Tokyo）の時（0〜23）。null は時間帯の記録開始前の古い行
            $table->unsignedTinyInteger('hour')->nullable()->after('date');
        });

        // user_id の外部キーは (user_id, date) ユニークを索引として使っているため、
        // 先に新しいユニーク（user_id が先頭で外部キーの索引になれる）を作ってから旧ユニークを落とす
        Schema::table('user_daily_accesses', function (Blueprint $table) {
            $table->unique(['user_id', 'date', 'hour']);
        });

        Schema::table('user_daily_accesses', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'date']);
        });
    }

    public function down(): void
    {
        // 1日1行へ戻すため、同じ (user_id, date) の重複行は最小 id の1行だけ残す。
        // 削除対象（＝最小 id より後の行）だけを集めるので、行数が多くても一覧は小さい
        $duplicateIds = DB::table('user_daily_accesses')
            ->whereRaw('id > (select min(id) from user_daily_accesses as t'
                . ' where t.user_id = user_daily_accesses.user_id and t.date = user_daily_accesses.date)')
            ->pluck('id');

        foreach ($duplicateIds->chunk(1000) as $chunk) {
            DB::table('user_daily_accesses')->whereIn('id', $chunk)->delete();
        }

        // up() と逆順（外部キーの索引を絶やさないよう、旧ユニークを作ってから新ユニークを落とす）
        Schema::table('user_daily_accesses', function (Blueprint $table) {
            $table->unique(['user_id', 'date']);
        });

        Schema::table('user_daily_accesses', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'date', 'hour']);
        });

        Schema::table('user_daily_accesses', function (Blueprint $table) {
            $table->dropColumn('hour');
        });
    }
};
