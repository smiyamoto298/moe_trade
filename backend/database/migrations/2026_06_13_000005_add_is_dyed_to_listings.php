<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 出品ごとの「染色済み」フラグ（削れあり is_worn と同様に出品時に指定する）
        Schema::table('listings', function (Blueprint $table) {
            $table->boolean('is_dyed')->default(false)->after('is_worn');
        });
    }

    public function down(): void
    {
        Schema::table('listings', function (Blueprint $table) {
            $table->dropColumn('is_dyed');
        });
    }
};
