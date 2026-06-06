<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->boolean('seller_completed')->default(false)->after('status');
            $table->boolean('buyer_completed')->default(false)->after('seller_completed');
        });
    }

    public function down(): void
    {
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->dropColumn(['seller_completed', 'buyer_completed']);
        });
    }
};
