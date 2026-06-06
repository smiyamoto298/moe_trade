<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trade_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('listing_id')->constrained('listings');
            $table->foreignId('item_id')->constrained('items');
            $table->foreignId('seller_id')->constrained('users');
            $table->string('seller_ip', 45)->nullable();
            $table->string('buyer_ip', 45)->nullable();
            $table->integer('price');
            $table->string('currency', 10)->default('AC');
            $table->enum('server', ['Emerald', 'Diamond', 'Pearl']);
            $table->boolean('is_valid')->default(true);
            $table->timestamp('traded_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trade_history');
    }
};
