<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 所持アイテム台帳の保存先（local / db）をユーザー単位で記憶する列を追加する。
 *
 * これまで保存先モードは端末の localStorage にしか無く、ある端末で「サーバー（DB）」を
 * 選んでも別端末では既定の local 表示に戻ってしまっていた。ユーザー単位でサーバーに
 * 持たせることで、どの端末でログインしても同じ保存先が適用されるようにする。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('inventory_storage_mode', 10)->default('local')->after('is_suspended');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('inventory_storage_mode');
        });
    }
};
