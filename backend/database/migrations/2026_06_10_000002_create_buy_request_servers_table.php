<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('buy_request_servers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('buy_request_id')->constrained('buy_requests')->cascadeOnDelete();
            $table->enum('server', ['Emerald', 'Diamond', 'Pearl']);
            $table->foreignId('character_id')->nullable()->constrained('user_characters')->nullOnDelete();
            $table->unique(['buy_request_id', 'server']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('buy_request_servers');
    }
};
