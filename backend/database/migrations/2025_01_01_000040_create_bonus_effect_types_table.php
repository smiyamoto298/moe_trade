<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bonus_effect_types', function (Blueprint $table) {
            $table->id();
            $table->string('type_key', 50)->unique();
            $table->string('label', 100);
            $table->string('category', 50);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bonus_effect_types');
    }
};
