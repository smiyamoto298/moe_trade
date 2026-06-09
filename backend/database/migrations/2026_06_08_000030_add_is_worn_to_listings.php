<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 出品ごとの「削れあり」（耐久度の削れがある中古品）フラグ
        Schema::table('listings', function (Blueprint $table) {
            $table->boolean('is_worn')->default(false)->after('comment');
        });
    }

    public function down(): void
    {
        Schema::table('listings', function (Blueprint $table) {
            $table->dropColumn('is_worn');
        });
    }
};
