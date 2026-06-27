<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * オークションの即決価格。
 * 出品: 入札がこの額以上で即時成立 / 買取: この額以下で即時成立。
 * 非オークション（即決・交渉可）では null。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('listings', function (Blueprint $table) {
            $table->integer('buyout_price')->nullable()->after('price');
        });
        Schema::table('buy_requests', function (Blueprint $table) {
            $table->integer('buyout_price')->nullable()->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('listings', fn (Blueprint $table) => $table->dropColumn('buyout_price'));
        Schema::table('buy_requests', fn (Blueprint $table) => $table->dropColumn('buyout_price'));
    }
};
