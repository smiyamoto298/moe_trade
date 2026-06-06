<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_characters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('server', ['Emerald', 'Diamond', 'Pearl']);
            $table->string('character_name', 100);
            $table->timestamps();
            $table->unique(['user_id', 'server']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_characters');
    }
};
