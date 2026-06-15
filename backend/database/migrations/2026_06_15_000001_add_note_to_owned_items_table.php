<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 所持アイテムごとの自由記入メモ（任意）。
 * ユーザーが行ごとに覚書を残せるようにする。未入力は null。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('owned_items', function (Blueprint $table) {
            $table->text('note')->nullable()->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('owned_items', function (Blueprint $table) {
            $table->dropColumn('note');
        });
    }
};
