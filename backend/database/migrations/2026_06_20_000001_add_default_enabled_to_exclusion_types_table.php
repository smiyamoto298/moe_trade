<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 共通除外アイテムの種別に「既定で適用するか（デフォルトON/OFF）」を持たせる。
 * 管理者がここを OFF にした種別は、まだ設定をいじっていないユーザーには既定で適用されない
 * （ユーザーは所有アイテム管理の「共通除外の設定」で個別にON/OFFを上書きできる）。
 * 既存の種別は従来どおり全適用なので default_enabled=true を既定とする。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exclusion_types', function (Blueprint $table) {
            $table->boolean('default_enabled')->default(true)->after('is_default');
        });
    }

    public function down(): void
    {
        Schema::table('exclusion_types', function (Blueprint $table) {
            $table->dropColumn('default_enabled');
        });
    }
};
