<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 他サイト等、サイト外で取引された相場情報を editor / admin が手動登録するためのテーブル
        Schema::create('market_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->integer('price');
            $table->string('currency', 10)->default('AC');
            $table->enum('server', ['Emerald', 'Diamond', 'Pearl']);
            $table->timestamp('traded_at');
            $table->foreignId('registered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 200)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('market_prices');
    }
};
