<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('board_threads', function (Blueprint $table) {
            // スレッド種別。item_correction=アイテム情報修正依頼 / request=要望 / bug=不具合 / other=その他
            // 既存スレッドは「その他」とみなす（enum は SQLite の ALTER と相性が悪いため string + アプリ側ホワイトリストで検証）
            $table->string('category', 32)->default('other')->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('board_threads', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }
};
