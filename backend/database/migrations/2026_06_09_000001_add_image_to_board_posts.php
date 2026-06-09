<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 運営掲示板：投稿への画像添付（public disk 上の相対パス）
        Schema::table('board_posts', function (Blueprint $table) {
            $table->string('image_path')->nullable()->after('message');
        });
    }

    public function down(): void
    {
        Schema::table('board_posts', function (Blueprint $table) {
            $table->dropColumn('image_path');
        });
    }
};
