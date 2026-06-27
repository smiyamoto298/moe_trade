<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * 取引方法に「オークション」(auction) を追加する。
     *
     * MySQL専用の ENUM 変更。SQLite（テスト環境）では create_listings_table /
     * create_buy_requests_table が最初から 'auction' を含めて定義しているためスキップする。
     * （update_listing_status_enum と同じ二段パターン）
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE listings MODIFY trade_type ENUM('fixed','negotiable','auction') NOT NULL");
            DB::statement("ALTER TABLE buy_requests MODIFY trade_type ENUM('fixed','negotiable','auction') NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE listings MODIFY trade_type ENUM('fixed','negotiable') NOT NULL");
            DB::statement("ALTER TABLE buy_requests MODIFY trade_type ENUM('fixed','negotiable') NOT NULL");
        }
    }
};
