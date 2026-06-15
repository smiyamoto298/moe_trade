<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 端末（ローカルストレージ）保存ユーザーが除外したアイテム名の匿名報告。
 *
 * ローカル保存の個別除外（user_excluded_items に入らない）でも、共通除外への
 * 昇格を検討できるよう、除外された「名前」だけを匿名で集める。誰が・何人除外したかは
 * 記録しない（user_id を持たない・名前は一意）。管理画面の共通除外候補に DB 保存分と
 * マージして表示する。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reported_excluded_names', function (Blueprint $table) {
            $table->id();
            $table->string('name', 200)->unique();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reported_excluded_names');
    }
};
