<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 付加効果ごとに「WarAgeでは効果がない」フラグを持たせる。
 * 表示時は説明の末尾に「※WarAgeでは効果がない」を付ける。
 *
 * - up: 列を追加し、説明に「※WarAgeでは効果がない」が含まれる既存行は
 *   その文言を説明から取り除いて no_warage_effect=true にバックフィルする。
 * - down: 列を削除する。
 */
return new class extends Migration
{
    private const NOTE = '※WarAgeでは効果がない';

    public function up(): void
    {
        if (!Schema::hasColumn('item_bonus_effects', 'no_warage_effect')) {
            Schema::table('item_bonus_effects', function (Blueprint $table) {
                $table->boolean('no_warage_effect')->default(false)->after('is_exclusive');
            });
        }

        // 説明に注記が含まれる行: 注記を取り除いてフラグを立てる
        DB::table('item_bonus_effects')
            ->where('description', 'like', '%' . self::NOTE . '%')
            ->orderBy('id')
            ->each(function ($row) {
                // 注記とその前後の空白（半角・全角・改行）をまとめて除去。
                // trim() の文字リストはバイト単位でマルチバイト文字を壊すため正規表現(/u)で処理する。
                $cleaned = preg_replace(
                    '/[\s　]*' . preg_quote(self::NOTE, '/') . '[\s　]*/u',
                    ' ',
                    (string) $row->description,
                );
                $cleaned = trim(preg_replace('/[\s　]+/u', ' ', $cleaned));

                DB::table('item_bonus_effects')
                    ->where('id', $row->id)
                    ->update([
                        'description'      => $cleaned,
                        'no_warage_effect' => true,
                    ]);
            });
    }

    public function down(): void
    {
        if (Schema::hasColumn('item_bonus_effects', 'no_warage_effect')) {
            Schema::table('item_bonus_effects', function (Blueprint $table) {
                $table->dropColumn('no_warage_effect');
            });
        }
    }
};
