<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL専用の ENUM 変更。SQLite（テスト環境）では create_trade_chats_table が
        // 最初から全ステータスを定義しているためスキップする。
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE trade_chats MODIFY status ENUM('open','deal','declined','deal_failed') NOT NULL DEFAULT 'open'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE trade_chats MODIFY status ENUM('open','deal','declined') NOT NULL DEFAULT 'open'");
        }
    }
};
