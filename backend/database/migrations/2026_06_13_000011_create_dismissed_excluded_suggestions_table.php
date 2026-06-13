<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 管理者が「共通除外にはしない」と却下したユーザー個別除外の候補名。
 * ここに登録された名前は、user-suggestions（共通除外への昇格候補）から除外され、
 * 何人が個別除外していても候補に再表示されない。判定はアイテム名（文字列）単位。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dismissed_excluded_suggestions', function (Blueprint $table) {
            $table->id();
            $table->string('name', 200)->unique();
            $table->foreignId('dismissed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dismissed_excluded_suggestions');
    }
};
