<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listing_servers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('listing_id')->constrained('listings')->cascadeOnDelete();
            $table->enum('server', ['Emerald', 'Diamond', 'Pearl']);
            $table->foreignId('character_id')->nullable()->constrained('user_characters')->nullOnDelete();
            $table->unique(['listing_id', 'server']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listing_servers');
    }
};
