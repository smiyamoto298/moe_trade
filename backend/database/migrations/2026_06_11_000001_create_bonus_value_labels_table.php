<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 付加効果の「項目名」候補。アイテム登録フォームの datalist と
        // 一覧の絞り込み候補に表示する。管理者・編集者が管理する。
        Schema::create('bonus_value_labels', function (Blueprint $table) {
            $table->id();
            $table->string('label', 100)->unique();
            $table->unsignedInteger('sort_order')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bonus_value_labels');
    }
};
