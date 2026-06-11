<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_characters', function (Blueprint $table) {
            // 出品・買取登録時に取引可能サーバーを既定チェックするための「デフォルトキャラ」フラグ。
            // 1ユーザーにつき最大1件 true（アプリ側で排他制御）。
            $table->boolean('is_default')->default(false)->after('character_name');
        });
    }

    public function down(): void
    {
        Schema::table('user_characters', function (Blueprint $table) {
            $table->dropColumn('is_default');
        });
    }
};
