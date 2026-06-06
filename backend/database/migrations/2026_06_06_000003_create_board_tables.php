<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 運営掲示板：スレッド
        Schema::create('board_threads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title', 200);
            $table->enum('status', ['open', 'resolved'])->default('open');
            $table->timestamps();
        });

        // 運営掲示板：投稿（チャット）
        Schema::create('board_posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('thread_id')->constrained('board_threads')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('message');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('board_posts');
        Schema::dropIfExists('board_threads');
    }
};
