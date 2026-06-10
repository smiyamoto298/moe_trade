<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 取引履歴に買い手のユーザーID（buyer_id）を追加する。
 * 「誰が取引したか」は IP ではなく user_id（seller_id / buyer_id）で紐づける。
 * seller_ip / buyer_ip は同一IP取引の相場除外判定のために残す。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trade_history', function (Blueprint $table) {
            $table->foreignId('buyer_id')
                ->nullable()
                ->after('seller_id')
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('trade_history', function (Blueprint $table) {
            $table->dropConstrainedForeignId('buyer_id');
        });
    }
};
