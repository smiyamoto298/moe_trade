<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * お知らせのリンクを新規ウィンドウ（_blank）で開くか、同じウィンドウ（_self）で開くかの選択。
 * デフォルトは同じウィンドウ（false）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->boolean('link_new_tab')->default(false)->after('link_label');
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->dropColumn('link_new_tab');
        });
    }
};
