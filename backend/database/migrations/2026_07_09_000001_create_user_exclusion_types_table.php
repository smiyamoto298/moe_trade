<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ユーザーごとのカスタム表示種別（アイテムボックス）。
 * 管理者管理の共通種別（exclusion_types）とは別に、各ユーザーが自分専用の種別を追加できる。
 * DB保存モードのとき台帳スナップショットと一緒に全置換で同期される（name 単位で upsert）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_exclusion_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            // 種別名はユーザー内で一意（クライアントも同名の追加を防ぐ）
            $table->unique(['user_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_exclusion_types');
    }
};
