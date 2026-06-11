<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('equipment_set_members', function (Blueprint $table) {
            $table->id();
            // セット本体アイテム
            $table->foreignId('set_item_id')->constrained('items')->cascadeOnDelete();
            // 構成部位の通常アイテム
            $table->foreignId('piece_item_id')->constrained('items')->cascadeOnDelete();
            $table->integer('sort_order')->default(0);
            $table->unique(['set_item_id', 'piece_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_set_members');
    }
};
