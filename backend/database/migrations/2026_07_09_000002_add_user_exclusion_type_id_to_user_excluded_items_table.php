<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ユーザーの種別割当（user_excluded_items）からカスタム種別（user_exclusion_types）への参照。
 * 設定されている割当はカスタム種別が実効種別になる（exclusion_type_id より優先）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_excluded_items', function (Blueprint $table) {
            $table->foreignId('user_exclusion_type_id')
                ->nullable()
                ->after('exclusion_type_id')
                ->constrained('user_exclusion_types')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('user_excluded_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_exclusion_type_id');
        });
    }
};
