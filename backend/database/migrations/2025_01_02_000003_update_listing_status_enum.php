<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE listings MODIFY status ENUM('active','expired','cancelled','completed','deal_failed') NOT NULL DEFAULT 'active'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE listings MODIFY status ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active'");
    }
};
