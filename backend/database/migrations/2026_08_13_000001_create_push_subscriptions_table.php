<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Web Push の購読情報。
 *
 * ブラウザが発行するエンドポイントURLと暗号化鍵のみを保存する（個人情報は含まない）。
 * endpoint はブラウザ（デバイス）ごとに一意。同一ブラウザで別ユーザーがログインし直して
 * 購読した場合は user_id を付け替える（upsert）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('endpoint', 500)->unique();
            $table->string('public_key');
            $table->string('auth_token');
            $table->string('content_encoding', 20)->default('aes128gcm');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }
};
