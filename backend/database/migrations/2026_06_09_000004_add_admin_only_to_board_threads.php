<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('board_threads', function (Blueprint $table) {
            // true の場合、このスレッドは管理者のみ閲覧・投稿可能
            $table->boolean('admin_only')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('board_threads', function (Blueprint $table) {
            $table->dropColumn('admin_only');
        });
    }
};
