<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL専用の ENUM 変更。SQLite（テスト環境）では create_listings_table が
        // 最初から全ステータスを定義しているためスキップする。
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE listings MODIFY status ENUM('active','expired','cancelled','completed','deal_failed') NOT NULL DEFAULT 'active'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE listings MODIFY status ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active'");
        }
    }
};
