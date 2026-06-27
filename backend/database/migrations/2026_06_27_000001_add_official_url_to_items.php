<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // 公式DB: MasterOfEpic公式サイト（moepic.com）のアイテムページへのリンク
            $table->string('official_url', 500)->nullable()->after('image_url');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('official_url');
        });
    }
};
