<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * アイテムのハッシュタグ。
 * - is_fixed=false: ユーザーが自由に追加・削除できる（wiki型・ログイン必須）
 * - is_fixed=true:  admin/editor がアイテム編集画面で設定する固定タグ。ユーザーは編集・削除不可
 * 一覧でアイテム名の下に表示し、タグでの絞り込み検索に使う。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_hashtags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->string('tag', 50);
            // 固定タグ（admin/editor 管理）はユーザーが削除できない
            $table->boolean('is_fixed')->default(false);
            // 追加したユーザー（監査用。固定タグやユーザー削除後は null）
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // 同一アイテムに同じタグは1つだけ
            $table->unique(['item_id', 'tag']);
            // タグでの絞り込み検索用
            $table->index('tag');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_hashtags');
    }
};
