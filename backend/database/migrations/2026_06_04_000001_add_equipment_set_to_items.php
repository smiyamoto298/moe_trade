<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 既存の 2025_01_02_000002_add_equipment_set_to_items で
        // 追加済みの場合があるため、未追加のときのみ追加する（重複追加によるmigrate失敗を防止）
        Schema::table('items', function (Blueprint $table) {
            if (!Schema::hasColumn('items', 'is_equipment_set')) {
                $table->boolean('is_equipment_set')->default(false)->after('dyeable');
            }
            if (!Schema::hasColumn('items', 'set_piece_category_ids')) {
                $table->json('set_piece_category_ids')->nullable()->after('is_equipment_set');
            }
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(array_filter(
                ['is_equipment_set', 'set_piece_category_ids'],
                fn($col) => Schema::hasColumn('items', $col)
            ));
        });
    }
};
